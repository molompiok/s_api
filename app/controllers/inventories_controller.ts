// app/controllers/inventories_controller.ts

import type { HttpContext } from '@adonisjs/core/http'
import Inventory from '#models/inventory'
import db from '@adonisjs/lucid/services/db'
import { v4 as uuidv4 } from 'uuid'
import vine from '@vinejs/vine'
import logger from '@adonisjs/core/services/logger'
import { createFiles } from './Utils/media/CreateFiles.js'
import { updateFiles } from './Utils/media/UpdateFiles.js'
import { deleteFiles } from './Utils/media/DeleteFiles.js'
import { EXT_IMAGE, MEGA_OCTET } from './Utils/ctrlManager.js'
import { TypeJsonRole } from '#models/role' // Assurez-vous que TypeJsonRole est bien exporté
import { t, normalizeStringArrayInput } from '../utils/functions.js'; // ✅ Ajout de t
import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import { applyOrderBy } from './Utils/query.js'

const REQUIRED_PERMISSION: keyof TypeJsonRole = 'manage_interface' // Permission requise

export default class InventoriesController {

    // --- Validation Schemas ---
    private createInventorySchema = vine.compile(
        vine.object({
            address_name: vine.string().trim().minLength(3).maxLength(255),
            email: vine.string().trim().email().normalizeEmail().optional(), // Email optionnel
            latitude: vine.number().min(-90).max(90),
            longitude: vine.number().min(-180).max(180),
            views: vine.any().optional()
        })
    );

    // Permission requise (inchangée)

    // Schéma de validation pour les query parameters de GET
    private getInventoriesSchema = vine.compile(
        vine.object({
            inventory_id: vine.string().uuid().optional(), // Pour récupérer un inventaire spécifique
            store_id: vine.string().uuid().optional(), // Pour filtrer par magasin (si nécessaire, mais souvent implicite)
            search: vine.string().trim().optional(), // Recherche par nom/email?
            page: vine.number().positive().optional(),
            limit: vine.number().positive().optional(),
            order_by: vine.string().trim().optional(), // Ajouter tri si besoin
        })
    );

    private getInventorySchema = vine.compile(
        vine.object({
            inventory_id: vine.string().uuid().optional(),
            page: vine.number().positive().optional(),
            limit: vine.number().positive().optional(),
        })
    );

    private updateInventorySchema = vine.compile(
        vine.object({
            // L'ID vient des params
            address_name: vine.string().trim().minLength(3).maxLength(255).optional(),
            email: vine.string().trim().email().normalizeEmail().optional(),
            latitude: vine.number().min(-90).max(90).optional(),
            longitude: vine.number().min(-180).max(180).optional(),
            views: vine.any().optional(), // ✅ Utiliser any pour Vine, sera normalisé ensuite
        })
    );

    private deleteInventoryParamsSchema = vine.compile(
        vine.object({
            id: vine.string().uuid(), // ID dans l'URL
        })
    );

    /**
     * @create
     * Crée un nouveau point d'inventaire.
     * Permission requise: 'manage_interface'
     */
    async create({ request, response, auth, bouncer }: HttpContext) {
        // 🔐 Authentification
        await auth.authenticate();
        // 🛡️ Permissions
        try {
            await bouncer.authorize('collaboratorAbility', [REQUIRED_PERMISSION]);
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') });
            }
            throw error;
        }

        const trx = await db.transaction();
        const inventoryId = uuidv4();

        try {
            // ✅ Validation Vine (Body)
            // Utiliser request.all() pour createFiles
            const payload = await this.createInventorySchema.validate(request.all());

            // Gérer l'upload des images pour 'views'
            const viewsUrls = await createFiles({
                request,
                column_name: "views",
                table_id: inventoryId,
                table_name: Inventory.table,
                options: {
                    compress: 'img',
                    min: 0, // Views optionnelles
                    max: 5,
                    extname: EXT_IMAGE,
                    maxSize: 5 * MEGA_OCTET,
                },
            });

            const newInventory = await Inventory.create(
                {
                    id: inventoryId,
                    address_name: payload.address_name,
                    email: payload.email,
                    latitude: payload.latitude,
                    longitude: payload.longitude,
                    views: viewsUrls,
                },
                { client: trx }
            );

            await trx.commit();
            logger.info({ userId: auth.user!.id, inventoryId: newInventory.id }, 'Inventory created');
            // 🌍 i18n
            return response.created({ message: t('inventory.createdSuccess'), inventory: newInventory }); // Nouvelle clé

        } catch (error) {
            await trx.rollback();
            // Supprimer les fichiers potentiellement uploadés
            await deleteFiles(inventoryId).catch(delErr => logger.error({ inventoryId, error: delErr }, 'Failed to cleanup files after inventory creation failure'));

            logger.error({ userId: auth.user?.id, error: error.message, stack: error.stack }, 'Failed to create inventory');
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
            }
            // 🌍 i18n
            return response.internalServerError({ message: t('inventory.creationFailed'), error: error.message }); // Nouvelle clé
        }
    }

    /**
     * @get_many
     * Récupère un ou plusieurs points d'inventaire.
     * Peut récupérer par ID spécifique ou lister avec pagination/filtres.
     * Permission requise: 'manage_interface'
     */
    async get_many({ request, response, auth, bouncer }: HttpContext) {
        // 🔐 Authentification
        await auth.authenticate();
        // 🛡️ Permissions
        try {
            await bouncer.authorize('collaboratorAbility', [REQUIRED_PERMISSION]);
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') });
            }
            throw error;
        }

        let payload: Infer<typeof this.getInventoriesSchema>;
        try {
            // ✅ Validation Vine pour Query Params
            payload = await this.getInventoriesSchema.validate(request.qs());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: t('validationFailed'), errors: error.messages });
            }
            logger.error({ error, qs: request.qs() }, "Failed to validate get_inventories query");
            throw error; // Relancer pour erreur serveur standard
        }

        try {
            let query = Inventory.query();

            if (payload.inventory_id) {
                const inventory = await query.where('id', payload.inventory_id).limit(1)
               return response.ok(inventory);
            }

           if (payload.search) {
                const searchTerm = `%${payload.search.toLowerCase()}%`;
                query.where((q) => {
                    q.whereILike('address_name', searchTerm)
                        .orWhereILike('email', searchTerm);
                });
            }

            // Ajouter tri
            const orderBy = payload.order_by || 'created_at_desc'; // Défaut
            query = applyOrderBy(query, orderBy, Inventory.table); // applyOrderBy doit gérer Lucid

            // Pagination
            const page = payload.page ?? 1;
            const limit = payload.limit ?? 15; // Limite par défaut raisonnable

            const inventories = await query.paginate(page, limit);

            // Pas de message i18n, retourner la liste paginée
            return response.ok({
                list:inventories.all(),
                meta:inventories.getMeta()
            }); // Retourne directement l'objet Paginator

        } catch (error) {
            logger.error({ userId: auth.user!.id, params: payload, error: error.message, stack: error.stack }, 'Failed to get inventories');
            if (error.code === 'E_ROW_NOT_FOUND') {
                // 🌍 i18n
                return response.notFound({ message: t('inventory.notFound') });
            }
            // 🌍 i18n
            return response.internalServerError({ message: t('inventory.fetchFailed'), error: error.message });
        }
    }

    /**
     * @get
     * Récupère un ou plusieurs points d'inventaire.
     * Permission requise: 'manage_interface'
     */
    async get({ request, response, auth, bouncer }: HttpContext) {
        // 🔐 Authentification
        await auth.authenticate();
        // 🛡️ Permissions
        try {
            await bouncer.authorize('collaboratorAbility', [REQUIRED_PERMISSION]);
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') });
            }
            throw error;
        }

        let payload: Infer<typeof this.getInventorySchema>;
        try {
            // ✅ Validation Vine pour Query Params
            payload = await this.getInventorySchema.validate(request.qs());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: t('validationFailed'), errors: error.messages });
            }
            throw error;
        }

        try {
            const query = Inventory.query();

            // 🔍 GET par ID
            if (payload.inventory_id) {
                const inventory = await query.where('id', payload.inventory_id).first(); // Utiliser .first()
                if (!inventory) {
                    // 🌍 i18n
                    return response.notFound({ message: t('inventory.notFound') }); // Nouvelle clé
                }
                return response.ok(inventory);
            } else {
                // Lister et paginer
                const page = payload.page ?? 1;
                const limit = payload.limit ?? 10;
                const inventories = await query
                    .orderBy('created_at', 'desc')
                    .paginate(page, limit);
                return response.ok(inventories);
            }
        } catch (error) {
            // Note: E_ROW_NOT_FOUND est géré par le .first() ci-dessus
            logger.error({ userId: auth.user!.id, error: error.message, stack: error.stack }, 'Failed to get inventories');
            // 🌍 i18n
            return response.internalServerError({ message: t('inventory.fetchFailed'), error: error.message }); // Nouvelle clé
        }
    }

    /**
     * @update
     * Met à jour un point d'inventaire existant.
     * Permission requise: 'manage_interface'
     */
    async update({ params, request, response, auth, bouncer }: HttpContext) {
        // 🔐 Authentification
        await auth.authenticate();
        // 🛡️ Permissions
        try {
            await bouncer.authorize('collaboratorAbility', [REQUIRED_PERMISSION]);
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') });
            }
            throw error;
        }

        const inventoryId = params.id; // ID depuis les paramètres d'URL
        if (!inventoryId) {
            // 🌍 i18n
            return response.badRequest({ message: t('inventory.idRequired') }); // Nouvelle clé
        }

        const trx = await db.transaction();
        let payload: Infer<typeof this.updateInventorySchema>;
        try {
            // ✅ Validation Vine (Body)
            // Utiliser request.all() pour updateFiles
            payload = await this.updateInventorySchema.validate(request.all());
            const inventory = await Inventory.findOrFail(inventoryId, { client: trx });

            // 📦 Normalisation pour 'views'
            let normalizedViews: string[] | undefined = undefined;
            if (payload.views !== undefined) { // Vérifier si la clé existe, même si vide
                try {
                    // Si payload.views est déjà un tableau, normalizeStringArrayInput le retournera tel quel
                    normalizedViews = normalizeStringArrayInput({ views: request.body().views }).views;
                } catch (error) {
                    // 🌍 i18n
                    await trx.rollback(); // Important de rollback ici
                    return response.badRequest({ message: t('invalid_value', { key: 'views', value: payload.views }) });
                }
            }

            console.log({normalizedViews, payload, b: request.body()});
            
            // Gérer la mise à jour des fichiers 'views'
            let updatedViewsUrls: string[] | undefined = undefined;
            if (payload.views !== undefined) { // Si payload.views était présent (même vide [])
                updatedViewsUrls = await updateFiles({
                    request,
                    table_name: Inventory.table,
                    table_id: inventoryId,
                    column_name: 'views',
                    lastUrls: inventory.views || [],
                    newPseudoUrls: normalizedViews, // Utiliser le tableau normalisé
                    options: {
                        compress: 'img', min: 0, max: 5, extname: EXT_IMAGE,
                        maxSize: 5 * MEGA_OCTET, throwError: true
                    },
                });
            }

            // Fusionner les données validées et les URLs mises à jour
            inventory.useTransaction(trx);
            inventory.merge({
                address_name: payload.address_name,
                email: payload.email, // merge gère undefined/null
                latitude: payload.latitude,
                longitude: payload.longitude,
                ...(updatedViewsUrls !== undefined && { views: updatedViewsUrls }),
            });

            await inventory.save();
            await trx.commit();

            logger.info({ userId: auth.user!.id, inventoryId: inventory.id }, 'Inventory updated');
            // 🌍 i18n
            return response.ok({ message: t('inventory.updateSuccess'), inventory: inventory }); // Nouvelle clé

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: auth.user?.id, inventoryId, error: error.message, stack: error.stack }, 'Failed to update inventory');
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
            }
            if (error.code === 'E_ROW_NOT_FOUND') {
                // 🌍 i18n
                return response.notFound({ message: t('inventory.notFound') });
            }
            // 🌍 i18n
            return response.internalServerError({ message: t('inventory.updateFailed'), error: error.message }); // Nouvelle clé
        }
    }

    /**
     * @delete
     * Supprime un point d'inventaire.
     * Permission requise: 'manage_interface'
     */
    async delete({ params, response, auth, bouncer }: HttpContext) {
        // 🔐 Authentification
        await auth.authenticate();
        // 🛡️ Permissions
        try {
            await bouncer.authorize('collaboratorAbility', [REQUIRED_PERMISSION]);
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') });
            }
            throw error;
        }

        let payload: Infer<typeof this.deleteInventoryParamsSchema>;
        try {
            // ✅ Validation Vine pour Params
            payload = await this.deleteInventoryParamsSchema.validate(params);
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: t('validationFailed'), errors: error.messages });
            }
            throw error;
        }

        const inventoryId = payload.id; // Utiliser l'ID validé
        const trx = await db.transaction();
        try {
            const inventory = await Inventory.findOrFail(inventoryId, { client: trx });

            // Supprimer l'enregistrement DB
            await inventory.useTransaction(trx).delete();
            await trx.commit(); // Commit avant suppression fichiers

            // Suppression des fichiers associés
            try {
                await deleteFiles(inventoryId);
            } catch (fileError) {
                logger.error({ inventoryId, error: fileError }, 'Failed to delete associated files after inventory deletion, but DB entry was removed.');
            }

            logger.info({ userId: auth.user!.id, inventoryId: inventoryId }, 'Inventory deleted');
            // 🌍 i18n
            return response.ok({ message: t('inventory.deleteSuccess') }); // Nouvelle clé

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: auth.user!.id, inventoryId, error: error.message, stack: error.stack }, 'Failed to delete inventory');
            if (error.code === 'E_ROW_NOT_FOUND') {
                // 🌍 i18n
                return response.notFound({ message: t('inventory.notFound') });
            }
            // 🌍 i18n
            return response.internalServerError({ message: t('inventory.deleteFailed'), error: error.message }); // Nouvelle clé
        }
    }
}