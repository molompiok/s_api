import Detail from '#models/detail';
import Product from '#models/product';
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db';
import { v4 } from 'uuid';
import { createFiles } from './Utils/media/CreateFiles.js';
import { EXT_IMAGE, EXT_VIDEO, MEGA_OCTET } from './Utils/ctrlManager.js';
import { updateFiles } from './Utils/media/UpdateFiles.js';
import { applyOrderBy } from './Utils/query.js'; // Gardé tel quel
import { deleteFiles } from './Utils/media/DeleteFiles.js';
import vine from '@vinejs/vine'; // ✅ Ajout de Vine
import { t } from '../utils/functions.js'; // ✅ Ajout de t
import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import logger from '@adonisjs/core/services/logger'; // Ajout pour logs
import { TypeJsonRole } from '#models/role'; // Pour type permissions

// Permissions requises (assumant les mêmes que pour les produits)
const EDIT_PERMISSION: keyof TypeJsonRole = 'edit_product';
const CREATE_DELETE_PERMISSION: keyof TypeJsonRole = 'create_delete_product';

export default class DetailsController {

    // --- Schémas de validation Vine ---
    private createDetailSchema = vine.compile(
        vine.object({
            product_id: vine.string().uuid(),
            title: vine.string().trim().minLength(1).maxLength(124).optional(),
            description: vine.string().trim().maxLength(2000).optional(), // Max length from original code
            type: vine.string().trim().maxLength(50).optional(), // Assuming a max length for type
            // 'view' est géré par createFiles
        })
    );

    private getDetailsSchema = vine.compile(
        vine.object({
            product_id: vine.string().uuid().optional(),
            detail_id: vine.string().uuid().optional(),
            id: vine.string().uuid().optional(), // Alias pour detail_id
            title: vine.string().trim().optional(),
            order_by: vine.string().trim().optional(),
            description: vine.string().trim().optional(),
            page: vine.number().positive().optional(),
            limit: vine.number().positive().optional(),
        })
    );

    private updateDetailSchema = vine.compile(
        vine.object({
            title: vine.string().trim().minLength(1).maxLength(124).optional(),
            description: vine.string().trim().maxLength(2000).optional().nullable(),
            index: vine.number().min(0).optional(), // Index peut être 0
            type: vine.string().trim().maxLength(50).optional(),
            view: vine.any().optional(), // Pour updateFiles (pseudo URLs)
        })
    );

    private deleteDetailParamsSchema = vine.compile(
      vine.object({
        id: vine.string().uuid(), // ID dans l'URL
      })
    );

    // --- Méthodes du contrôleur ---

    async create_detail({ request, response, auth, bouncer }: HttpContext) {
         // 🔐 Authentification
        await auth.authenticate();
        // 🛡️ Permissions
        try {
            await bouncer.authorize('collaboratorAbility', [EDIT_PERMISSION]) // Créer un détail = éditer un produit
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                 // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') })
            }
            throw error;
        }

        const id = v4()
        const trx = await db.transaction();

        try {
             // ✅ Validation Vine (pour le body)
             // Utiliser request.all() car createFiles a besoin des fichiers
            const payload = await this.createDetailSchema.validate(request.all());

            // Vérifier existence produit
            const product = await Product.find(payload.product_id);
            if (!product) {
                 // 🌍 i18n
                 return response.notFound({ message: t('product.notFound') });
            }

            // Gestion fichier 'view'
            let viewUrls = await createFiles({
                request,
                column_name: "view", // Nom du champ dans la requête form-data
                table_id: id,
                table_name: Detail.table,
                options: {
                    throwError: true,
                    compress: 'img',
                    min: 0, // Optionnel
                    max: 1,
                    extname: [...EXT_IMAGE, ...EXT_VIDEO],
                    maxSize: 12 * MEGA_OCTET,
                },
            });

            // --- Logique métier (inchangée pour l'index) ---
            const maxIndexResult = await Detail.query({ client: trx }) // Utiliser la transaction
                .where('product_id', payload.product_id)
                .max('index as max');

            const maxIndex = maxIndexResult[0]?.$extras.max;
            const index = (typeof maxIndex === 'number') ? maxIndex + 1 : 0; // Calcul de l'index

            const detail = await Detail.create({
                id: id,
                product_id: payload.product_id,
                title: payload.title,
                description: payload.description,
                view: viewUrls,
                index: index,
                type: payload.type,
            }, { client: trx })

            await trx.commit()
            logger.info({ userId: auth.user!.id, detailId: detail.id, productId: detail.product_id }, 'Detail created');
            // 🌍 i18n
            return response.created({ message: t('detail.createdSuccess'), detail: detail }); // Nouvelle clé

        } catch (error) {
            await trx.rollback()
            // Nettoyage fichiers
            await deleteFiles(id).catch(delErr => logger.error({ detailIdAttempt: id, error: delErr }, 'Failed to cleanup files after detail creation failure'));

            logger.error({ userId: auth.user?.id, error: error.message, stack: error.stack }, 'Failed to create detail');
            if (error.code === 'E_VALIDATION_ERROR') {
                 // 🌍 i18n
                 return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages })
            }
             if (error.code === 'E_ROW_NOT_FOUND') { // Peut arriver si Product.find échoue entretemps
                  // 🌍 i18n
                  return response.notFound({ message: t('product.notFound') });
             }
             // 🌍 i18n
            return response.internalServerError({ message: t('detail.creationFailed'), error: error.message }); // Nouvelle clé
        }
    }

    // Lecture publique
    async get_details({ request, response }: HttpContext) {
        let payload: Infer<typeof this.getDetailsSchema>;
        try {
            // ✅ Validation Vine pour Query Params
            payload = await this.getDetailsSchema.validate(request.qs());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: t('validationFailed'), errors: error.messages })
            }
            throw error;
        }

        const detail_id = payload.detail_id || payload.id; // Utiliser l'alias 'id'
        const product_id = payload.product_id;

        if (!detail_id && !product_id) {
            // 🌍 i18n
            return response.badRequest({ message: t('detail.idOrProductIdRequired') }); // Nouvelle clé
        }

        try {
            let query = Detail.query();

             // 🔍 GET par ID
            if (detail_id) {
                 const detail = await query.where('id', detail_id).first(); // Utiliser .first()
                 if (!detail) {
                    // 🌍 i18n
                    return response.notFound({ message: t('detail.notFound') }); // Nouvelle clé
                 }
                 return response.ok(detail); // Retourner l'objet unique
            }

            // Si pas d'ID spécifique, appliquer les filtres et paginer
            if (product_id) query = query.where('product_id', product_id);
            if (payload.title) query = query.whereLike('title', `%${payload.title}%`);
            if (payload.description) query = query.whereLike('description', `%${payload.description}%`);

            const orderBy = payload.order_by || 'index_asc'; // Défaut à index ascendant si non fourni
            query = applyOrderBy(query, orderBy, Detail.table); // Assurer que applyOrderBy gère 'index_asc'

            const page = payload.page ?? 1;
            const limit = payload.limit ?? 20;

            const details = await query.paginate(page, limit);

            return response.ok({ list: details.all(), meta: details.getMeta() }); // Retourner la liste paginée
        } catch (error) {
            logger.error({ error: error.message, stack: error.stack }, 'Failed to get details');
            // 🌍 i18n
            return response.internalServerError({ message: t('detail.fetchFailed'), error: error.message }); // Nouvelle clé
        }
    }

    async update_detail({ params, request, response, auth, bouncer }: HttpContext) {
         // 🔐 Authentification
         await auth.authenticate();
         // 🛡️ Permissions
         try {
             await bouncer.authorize('collaboratorAbility', [EDIT_PERMISSION])
         } catch (error) {
             if (error.code === 'E_AUTHORIZATION_FAILURE') {
                  // 🌍 i18n
                 return response.forbidden({ message: t('unauthorized_action') })
             }
             throw error;
         }

        const detailId = params.id; // ID depuis les paramètres d'URL
        if (!detailId) {
             // 🌍 i18n
             return response.badRequest({ message: t('detail.idRequired') }); // Nouvelle clé
        }

        const trx = await db.transaction(); // Utiliser transaction pour la réindexation potentielle
        let payload: Infer<typeof this.updateDetailSchema>;
        try {
            console.log({payload:request.all()});
            
             // ✅ Validation Vine (pour le body)
             // Utiliser request.all() car updateFiles a besoin des fichiers
            payload = await this.updateDetailSchema.validate(request.all());

            const detail = await Detail.findOrFail(detailId, { client: trx }); // Utiliser findOrFail avec transaction

            // --- Logique métier (inchangée pour la réindexation) ---
            // Gérer la mise à jour de 'view'
            let updatedViewUrls: string[] | undefined = undefined;
            if (payload.view) {
                updatedViewUrls = await updateFiles({
                    request,
                    table_name: Detail.table,
                    table_id: detail.id,
                    column_name: 'view',
                    lastUrls: detail.view || [],
                    newPseudoUrls: payload.view,
                    options: {
                        throwError: true, min: 0, max: 1, compress: 'img',
                        extname: [...EXT_IMAGE, ...EXT_VIDEO], maxSize: 12 * MEGA_OCTET,
                    },
                });
            }

            // Préparer les données à fusionner
            const dataToMerge: Partial<Detail> = {
                ...(payload.title && { title: payload.title.trim().substring(0, 124) }),
                ...(payload.description !== undefined && { description: payload.description?.trim().substring(0, 2000) }), // Gérer null
                ...(updatedViewUrls !== undefined && { view: updatedViewUrls }),
                ...(payload.type && { type: payload.type })
            };

            // Appliquer la fusion de base
            detail.useTransaction(trx).merge(dataToMerge);

            // Gérer la réindexation si l'index a changé
            let newIndex = payload.index;
            if (newIndex !== undefined && newIndex !== detail.index) {
                const productId = detail.product_id;
                const details = await Detail.query({ client: trx })
                    .where('product_id', productId)
                    .orderBy('index', 'asc');

                newIndex = newIndex < 0 ? 0 : (newIndex >= details.length ? details.length -1 : newIndex); // Ajuster l'index cible

                // Supprimer l'élément actuel (déjà chargé comme 'detail')
                const currentIndex = details.findIndex(d => d.id === detail.id);
                if (currentIndex > -1) {
                    details.splice(currentIndex, 1);
                } else {
                     // Ne devrait pas arriver si detail a été trouvé, mais sécurité
                     logger.warn({ detailId, productId }, "Detail to reindex not found in siblings list");
                }

                // Insérer l'élément (qui a déjà les données mergées mais pas encore l'index) à la nouvelle position
                 details.splice(newIndex, 0, detail);

                // Réassigner les index et sauvegarder TOUS les détails affectés DANS la transaction
                for (let i = 0; i < details.length; i++) {
                    if (details[i].index !== i) { // Sauvegarder seulement si l'index change
                         details[i].index = i;
                         await details[i].useTransaction(trx).save();
                    }
                }
                 // S'assurer que l'index du détail courant est bien mis à jour avant la sauvegarde finale
                 detail.index = newIndex;
            }
            // --- Fin logique métier réindexation ---

            // Sauvegarder le détail courant (s'il n'a pas été sauvegardé dans la boucle de réindexation)
            if (!detail.$isPersisted || detail.$isDirty) { // Vérifier si déjà sauvé ou si modifié hors index
              await detail.useTransaction(trx).save();
            }

            await trx.commit();
            logger.info({ userId: auth.user!.id, detailId: detail.id }, 'Detail updated');
             // 🌍 i18n
            return response.ok({ message: t('detail.updateSuccess'), detail: detail }); // Nouvelle clé

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: auth.user?.id, detailId, error: error.message, stack: error.stack }, 'Failed to update detail');
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages })
            }
            if (error.code === 'E_ROW_NOT_FOUND') {
                 // 🌍 i18n
                 return response.notFound({ message: t('detail.notFound') });
            }
            // 🌍 i18n
            return response.internalServerError({ message: t('detail.updateFailed'), error: error.message }); // Nouvelle clé
        }
    }

    async delete_detail({ params, response, auth, bouncer }: HttpContext) {
         // 🔐 Authentification
         await auth.authenticate();
         // 🛡️ Permissions
         try {
            // Utiliser la permission de suppression produit ?
             await bouncer.authorize('collaboratorAbility', [CREATE_DELETE_PERMISSION])
         } catch (error) {
             if (error.code === 'E_AUTHORIZATION_FAILURE') {
                  // 🌍 i18n
                 return response.forbidden({ message: t('unauthorized_action') })
             }
             throw error;
         }

        let payload: Infer<typeof this.deleteDetailParamsSchema>;
        try {
            // ✅ Validation Vine pour Params
            payload = await this.deleteDetailParamsSchema.validate(params);
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: t('validationFailed'), errors: error.messages })
            }
            throw error;
        }

        const trx = await db.transaction();
        try {
            const detail = await Detail.findOrFail(payload.id, { client: trx }); // Utiliser findOrFail
            const productId = detail.product_id; // Garder l'ID produit pour la réindexation

            // Supprimer l'enregistrement DB
            await detail.useTransaction(trx).delete();

             // --- Logique métier (réindexation après suppression) ---
             // Si la suppression a réussi (pas d'erreur levée), on réindexe
             const remainingDetails = await Detail.query({ client: trx })
                .where('product_id', productId)
                .orderBy('index', 'asc');

            for (let i = 0; i < remainingDetails.length; i++) {
                if (remainingDetails[i].index !== i) {
                    remainingDetails[i].index = i;
                    await remainingDetails[i].useTransaction(trx).save();
                }
            }
            // --- Fin logique métier réindexation ---

            await trx.commit(); // Commit avant suppression fichiers

            // Suppression des fichiers associés
            try {
                await deleteFiles(payload.id);
            } catch (fileError) {
                logger.error({ detailId: payload.id, error: fileError }, 'Failed to delete associated files after detail deletion, but DB entry was removed.');
            }

            logger.info({ userId: auth.user!.id, detailId: payload.id }, 'Detail deleted');
            // 🌍 i18n
            return response.ok({ message: t('detail.deleteSuccess') }); // Utiliser OK avec message

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: auth.user!.id, detailId: payload?.id, error: error.message, stack: error.stack }, 'Failed to delete detail');
            if (error.code === 'E_ROW_NOT_FOUND') {
                 // 🌍 i18n
                return response.notFound({ message: t('detail.notFound') });
            }
            // 🌍 i18n
            return response.internalServerError({ message: t('detail.deleteFailed'), error: error.message }); // Nouvelle clé
        }
    }
}