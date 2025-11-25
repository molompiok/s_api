import type { HttpContext } from '@adonisjs/core/http'
import { v4 } from 'uuid';
import { createFiles } from './Utils/media/CreateFiles.js';
import Categorie from '#models/categorie';
import { EXT_IMAGE, MEGA_OCTET } from './Utils/ctrlManager.js';
import db from '@adonisjs/lucid/services/db';
import { applyOrderBy } from './Utils/query.js'; // Gardé tel quel
import { updateFiles } from './Utils/media/UpdateFiles.js';
import { deleteFiles } from './Utils/media/DeleteFiles.js';
import Product from '#models/product';
import vine from '@vinejs/vine'; // ✅ Ajout de Vine
import { normalizeStringArrayInput } from '../utils/functions.js';
import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import logger from '@adonisjs/core/services/logger'; // Ajout pour logs
import { TypeJsonRole } from '#models/role'; // Pour type permissions
import { securityService } from '#services/SecurityService';

// Permissions (supposant les mêmes que pour les produits)
const EDIT_CATEGORY_PERMISSION: keyof TypeJsonRole = 'edit_product';
const CREATE_DELETE_CATEGORY_PERMISSION: keyof TypeJsonRole = 'create_delete_product';

export default class CategoriesController {

    // --- Schémas de validation Vine ---
    private getCategoriesSchema = vine.compile(
        vine.object({
            categories_id: vine.any().optional(), // Sera normalisé
            search: vine.string().trim().optional(),
            slug: vine.string().trim().optional(),
            order_by: vine.string().trim().optional(),
            page: vine.number().positive().optional(),
            limit: vine.number().positive().optional(),
            is_visible: vine.boolean().optional(), // Remplacé par auth/bouncer
            category_id: vine.string().uuid().optional(), // ID spécifique
            with_product_count: vine.boolean().optional(),
        })
    );

    private getSubCategoriesSchema = vine.compile(
        vine.object({
            category_id: vine.string().uuid(), // Requis pour trouver les sous-catégories
        })
    );

    private getFiltersSchema = vine.compile(
        vine.object({
            slug: vine.string().trim().optional(), // Slug de la catégorie pour filtres spécifiques
        })
    );

    private createCategorySchema = vine.compile(
        vine.object({
            name: vine.string().trim().minLength(1).maxLength(255),
            description: vine.string().trim().maxLength(1000).optional(), // Limiter description
            parent_category_id: vine.string().uuid().optional().nullable(), // Peut être null pour catégorie racine
            is_visible: vine.boolean().optional(),
        })
    );

    private updateCategorySchema = vine.compile(
        vine.object({
            name: vine.string().trim().minLength(1).maxLength(255).optional(),
            description: vine.string().trim().maxLength(1000).optional().nullable(),
            parent_category_id: vine.string().optional().nullable(),
            view: vine.any().optional(),
            icon: vine.any().optional(),
            is_visible: vine.boolean().optional(),
        })
    );

    private categoryIdParamsSchema = vine.compile(
        vine.object({
            id: vine.string().uuid(), // ID dans l'URL
        })
    );

    // --- Méthodes du contrôleur ---

    // Lecture publique des catégories
    async get_categories({ response, request }: HttpContext) { // Retiré auth
        let payload: Infer<typeof this.getCategoriesSchema>;
        try {
            // ✅ Validation Vine pour Query Params
            payload = await this.getCategoriesSchema.validate(request.qs());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: "La validation des données a échoué.", errors: error.messages });
            }
            throw error;
        }

        console.log(payload);

        // 📦 Normalisation categories_id
        let normalizedCategoriesIds: string[] | undefined = undefined;
        if (payload.categories_id) {
            try {
                normalizedCategoriesIds = normalizeStringArrayInput({ categories_id: payload.categories_id }).categories_id;
            } catch (error) {
                return response.badRequest({ message: `La valeur du champ 'categories_id' est invalide: ${payload.categories_id}` });
            }
        }

        try {
            // Utiliser Lucid ORM pour plus de flexibilité
            let query = Categorie.query().select('*');

            // Appliquer les filtres
            if (payload.with_product_count) {
                query
                    .select(
                        db.raw(`COALESCE(
                            (SELECT COUNT(*) 
                            FROM products 
                            WHERE products.categories_id @> jsonb_build_array(categories.id)), 0) 
                            AS product_count`)
                    )
            }

            if (normalizedCategoriesIds && normalizedCategoriesIds.length > 0) {
                query.whereIn('id', normalizedCategoriesIds);
            }
            // 🔍 GET par ID
            if (payload.category_id) {
                query.where('id', payload.category_id).first(); // Utiliser .first()

            }
            // 🔍 GET par Slug
            if (payload.slug) {
                query.where('slug', payload.slug).first(); // Utiliser .first()
            }
            if (payload.is_visible !== undefined && payload.is_visible !== null) {
                query = query.where('is_visible', payload.is_visible);
            }

            if (payload.search) {
                if (payload.search.startsWith('#')) {
                    const searchTerm = payload.search.substring(1).toLowerCase();
                    const searchPattern = `${searchTerm}%`;
                    query.whereRaw('LOWER(CAST(id AS TEXT)) LIKE ?', [searchPattern])
                        .first()
                } else {
                    const searchTerm = `%${payload.search.toLowerCase().split(" ").join('%')}%`;
                    query.where(q => {
                        q.whereILike('name', searchTerm)
                            .orWhereILike('description', searchTerm);
                    });
                }
            }

            // Tri et Pagination
            const orderBy = payload.order_by || 'name_asc'; // Tri par nom par défaut
            query = applyOrderBy(query, orderBy, Categorie.table); // applyOrderBy doit gérer Lucid

            const pageNum = payload.page ?? 1;
            // Limite par défaut plus raisonnable que 1000 pour une API publique
            const limitNum = payload.limit && payload.limit <= 100 ? payload.limit : 50;

            const categoriesPaginate = await query.paginate(pageNum, limitNum);

            // Ajouter product_count si demandé (si relation chargée)
            const list = categoriesPaginate.all().map(cat => ({
                ...cat.serialize(),
                product_count: cat.$extras.product_count ?? 0
            }));

            // Pas de message i18n car on retourne les données

            return response.ok({
                list, // Renvoyer directement les objets sérialisés
                meta: categoriesPaginate.getMeta()
            });

        } catch (error) {
            logger.error({ params: payload, error: error.message, stack: error.stack }, 'Failed to get categories');
            // 🌍 i18n
            return response.internalServerError({ message: "Erreur lors de la erreur lors de la récupération du/de la catégorie.", error: error.message }); // Nouvelle clé
        }
    }

    // Lecture publique
    async get_sub_categories({ response, request }: HttpContext) {
        let payload: Infer<typeof this.getSubCategoriesSchema>;
        try {
            // ✅ Validation Vine pour Query Params
            payload = await this.getSubCategoriesSchema.validate(request.qs());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: "La validation des données a échoué.", errors: error.messages });
            }
            throw error;
        }

        try {
            // --- Logique métier (inchangée mais utilise Lucid) ---
            const sub_categories = await Categorie.query()
                .where('parent_category_id', payload.category_id)
                .orderBy('name', 'asc'); // Tri par nom par défaut

            // Pas de message i18n
            return response.ok(sub_categories);

        } catch (error) {
            logger.error({ parentCategoryId: payload?.category_id, error: error.message, stack: error.stack }, 'Failed to get sub-categories');
            // 🌍 i18n
            return response.internalServerError({ message: "fetchSubFailed.", error: error.message }); // Nouvelle clé
        }
    }

    // Lecture publique
    async get_filters({ response, request }: HttpContext) {
        let payload: Infer<typeof this.getFiltersSchema>;
        try {
            // ✅ Validation Vine pour Query Params
            payload = await this.getFiltersSchema.validate(request.qs());
            console.log(payload);
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: "La validation des données a échoué.", errors: error.messages });
            }
            throw error;
        }

        let filters = [];
        try {
            // --- Logique métier (utilise méthodes statiques du modèle) ---
            if (payload.slug) {
                filters = await Categorie.getAvailableFilters(payload.slug);
            } else {
                filters = await Categorie.getGlobalFilters();
            }
            // Pas de message i18n
            return response.ok(filters); // Utiliser OK et renvoyer le tableau

        } catch (error) {
            logger.error({ slug: payload.slug, error: error.message, stack: error.stack }, 'Failed to get filters');
            // Si getAvailableFilters lève une erreur "not found"
            if (error.message?.includes("Aucune catégorie trouvée avec le slug")) {
                // 🌍 i18n
                return response.notFound({ message: "Catégorie n'a pas été trouvé(e).", error: error.message });
            }
            // 🌍 i18n
            return response.internalServerError({ message: "fetchFiltersFailed.", error: error.message }); // Nouvelle clé
        }
    }

    async create_category({ request, response, auth }: HttpContext) {
        // 🔐 Authentification
        await securityService.authenticate({ request, auth });
        // 🛡️ Permissions
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [CREATE_DELETE_CATEGORY_PERMISSION]);
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: "Vous n'avez pas la permission d'effectuer cette action." });
            }
            throw error;
        }

        const trx = await db.transaction();
        const category_id = v4();
        let payload: Infer<typeof this.createCategorySchema> = {} as any;

        try {
            // ✅ Validation Vine (Body)
            // Utiliser request.all() pour createFiles
            const data = request.all()
            const preparedData = {
                ...data,
                parent_category_id: data.parent_category_id === 'null' ? null : data.parent_category_id === 'undefined' ? undefined : data.parent_category_id,
                is_visible: data.is_visible === 'true' ? true : data.is_visible === 'false' ? false : payload.is_visible,
            };

            console.log(data);

            payload = await this.createCategorySchema.validate(preparedData);


            // --- Logique métier (avec fichiers) ---
            // Vérifier si parent_category_id existe (si fourni)
            if (payload.parent_category_id) {
                const parent = await Categorie.find(payload.parent_category_id, { client: trx });
                if (!parent) {
                    await trx.rollback();
                    // 🌍 i18n
                    return response.badRequest({ message: `La catégorie parente avec l'ID ${payload.parent_category_id} n'a pas été trouvée.` });
                }
            }

            // Gestion fichiers 'view' et 'icon'
            const viewUrls = await createFiles({
                request, column_name: "view", table_id: category_id, table_name: Categorie.table,
                options: { compress: 'img', min: 1, max: 1, maxSize: 12 * MEGA_OCTET, extname: EXT_IMAGE, throwError: true }, // Rendre view requis (min: 1)
            });
            const iconUrls = await createFiles({
                request, column_name: "icon", table_id: category_id, table_name: Categorie.table,
                options: { compress: 'img', min: 1, max: 1, maxSize: 12 * MEGA_OCTET, extname: EXT_IMAGE, throwError: true }, // Rendre icon requis (min: 1)
            });
            // Les erreurs de createFiles lèveront une exception attrapée par le catch global

            const newCategory = await Categorie.create({
                id: category_id,
                name: payload.name, // Nom validé
                description: payload.description ?? '', // Description validée
                parent_category_id: payload.parent_category_id, // Parent validé (existence vérifiée)
                is_visible: true,
                view: viewUrls,
                icon: iconUrls
            }, { client: trx });

            await trx.commit();
            logger.info({ userId: auth.user!.id, categoryId: newCategory.id }, 'Category created');
            // 🌍 i18n
            return response.created({ message: "Catégorie créé(e) avec succès.", category: newCategory }); // Nouvelle clé

        } catch (error) {
            await trx.rollback();
            // Nettoyage fichiers
            await deleteFiles(category_id).catch(delErr => logger.error({ categoryIdAttempt: category_id, error: delErr }, 'Failed to cleanup files after category creation failure'));

            logger.error({ userId: auth.user?.id, payload, error: error.message, stack: error.stack }, 'Failed to create category');
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: "La validation des données a échoué.", errors: error.messages });
            }
            // 🌍 i18n
            return response.internalServerError({ message: "Erreur lors de la erreur lors de la création du/de la catégorie.", error: error.message }); // Nouvelle clé
        }
    }

    async update_category({ request, response, auth, params }: HttpContext) {
        // 🔐 Authentification
        await securityService.authenticate({ request, auth });
        // 🛡️ Permissions

        console.log({ params });

        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [EDIT_CATEGORY_PERMISSION]);
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: "Vous n'avez pas la permission d'effectuer cette action." });
            }
            throw error;
        }
        let category_id: string = params.id;

        const trx = await db.transaction();
        let payload: Infer<typeof this.updateCategorySchema> = {} as any;

        try {
            // ✅ Validation Vine (Body)

            category_id = (await this.categoryIdParamsSchema.validate(params)).id;
            payload = await this.updateCategorySchema.validate(request.all());

             if (payload.parent_category_id =='null'|| payload.parent_category_id =='none'){
                payload.parent_category_id = null
            }
            console.log({ payload, category_id, files: request.allFiles() });

            // --- Logique métier (avec fichiers) ---
            const category = await Categorie.findOrFail(category_id, { client: trx });

            // Vérifier si parent_category_id existe (si fourni et différent)
            if (payload.parent_category_id && payload.parent_category_id !== category.parent_category_id) {
                if (payload.parent_category_id === category.id) { // Empêcher auto-référence
                    await trx.rollback();
                    // 🌍 i18n
                    return response.badRequest({ message: "cannotBeOwnParent." }); // Nouvelle clé
                }
                const parent = await Categorie.find(payload.parent_category_id, { client: trx });
                if (!parent) {
                    await trx.rollback();
                    // 🌍 i18n
                    return response.badRequest({ message: `La catégorie parente avec l'ID ${payload.parent_category_id} n'a pas été trouvée.` });
                }
            } 

            // Préparer les données à fusionner (hors fichiers)
            const dataToMerge: Partial<Categorie> = {
                ...(payload.name && { name: payload.name }),
                ...(payload.description !== undefined && { description: payload.description ?? '' }),
                ...(payload.parent_category_id !== undefined && { parent_category_id: payload.parent_category_id }),
                ...(payload.is_visible !== undefined && { is_visible: payload.is_visible }),
            };

            // Gérer la mise à jour des fichiers 'view' et 'icon'
            for (const f of ['view', 'icon'] as const) {
                if (payload[f] !== undefined) { // Si la clé existe dans le payload validé
                    let normalizedUrls: string[] = [];
                    try {
                        normalizedUrls = normalizeStringArrayInput({ [f]: payload[f] })[f];
                    } catch (error) {
                        await trx.rollback();
                        return response.badRequest({ message: `La valeur du champ '${f}' est invalide: ${payload[f]}` });
                    }

                    if (normalizedUrls !== undefined) { // Vérifier après normalisation
                        const updatedUrls = await updateFiles({
                            request, table_name: Categorie.table, table_id: category_id, column_name: f,
                            lastUrls: category[f] || [], newPseudoUrls: normalizedUrls,
                            options: {
                                throwError: true, min: 1, max: 1, compress: 'img',
                                extname: EXT_IMAGE, maxSize: 12 * MEGA_OCTET,
                            },
                        });
                        // S'assurer qu'on a toujours une URL (min: 1 dans options)
                        if (updatedUrls.length > 0) {
                            dataToMerge[f] = updatedUrls;
                        } else {
                            // Si updateFiles retourne un tableau vide malgré min:1, c'est une erreur
                            // 🌍 i18n
                            await trx.rollback();
                            return response.internalServerError({ message: `Erreur lors de la mise à jour du fichier pour le champ '${f}'.` });
                        }
                    }
                }
            }


            category.useTransaction(trx).merge(dataToMerge);
           
            await category.save(); // Le hook beforeSave mettra à jour le slug si le nom change
            // --- Fin logique métier ---

            await trx.commit();
            logger.info({ userId: auth.user!.id, categoryId: category.id }, 'Category updated');
            // 🌍 i18n
            return response.ok({ message: "Catégorie mis(e) à jour avec succès.", category: category }); // Nouvelle clé

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: auth.user?.id, payload, error: error.message, stack: error.stack }, 'Failed to update category');
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: "La validation des données a échoué.", errors: error.messages });
            }
            if (error.code === 'E_ROW_NOT_FOUND') {
                // 🌍 i18n
                return response.notFound({ message: "Catégorie n'a pas été trouvé(e)." });
            }
            // 🌍 i18n
            return response.internalServerError({ message: "Erreur lors de la erreur lors de la mise à jour du/de la catégorie.", error: error.message }); // Nouvelle clé
        }
    }

    async delete_category({ params, response, request, auth }: HttpContext) {
        // 🔐 Authentification
        await securityService.authenticate({ request, auth });
        // 🛡️ Permissions
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [CREATE_DELETE_CATEGORY_PERMISSION]);
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: "Vous n'avez pas la permission d'effectuer cette action." });
            }
            throw error;
        }

        let payload: Infer<typeof this.categoryIdParamsSchema>;
        try {
            // ✅ Validation Vine pour Params
            payload = await this.categoryIdParamsSchema.validate(params);
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: "La validation des données a échoué.", errors: error.messages });
            }
            throw error;
        }

        const category_id = payload.id;
        const trx = await db.transaction();
        try {
            // --- Logique métier (gestion des sous-catégories et produits) ---
            const category = await Categorie.findOrFail(category_id, { client: trx });

            // 1. Détacher les sous-catégories (mettre parent_category_id à null)
            await Categorie.query({ client: trx })
                .where('parent_category_id', category_id)
                .update({ parent_category_id: null });
            logger.debug({ categoryId: category_id }, "Sub-categories detached");

            // 2. Retirer la catégorie des produits associés (dans le JSON categories_id)
            // Attention: Opération potentiellement lourde sur grosse table Product.
            // Utiliser db.rawQuery pour une MAJ JSON optimisée (spécifique PostgreSQL)
            const productsToUpdate = await Product.query({ client: trx })
                .select('id', 'categories_id')
                .whereRaw('categories_id::jsonb \\? ?', [category_id]) // Vérifie si l'ID est dans le JSON
                .forUpdate() // Verrouiller les lignes produit

            for (const p of productsToUpdate) {
                let currentCategories: string[] = [];
                try {
                    // Le modèle Product prépare déjà en JSON, mais ici on lit brut
                    currentCategories = Array.isArray(p.categories_id) ? p.categories_id : JSON.parse(p.categories_id || '[]');
                } catch (parseError) {
                    logger.warn({ productId: p.id, categoriesId: p.categories_id }, "Failed to parse categories_id during category delete cleanup");
                    continue; // Passer au produit suivant
                }

                if (Array.isArray(currentCategories)) {
                    const newCategories = currentCategories.filter(id => id !== category_id);
                    // Mettre à jour directement via une requête pour éviter le cycle hook/save du modèle Product
                    await Product.query({ client: trx })
                        .where('id', p.id)
                        .update({ categories_id: JSON.stringify(newCategories) }) // Sauver comme JSON string
                }
            }
            logger.debug({ categoryId: category_id, updatedProducts: productsToUpdate.length }, "Category removed from products");


            // 3. Supprimer la catégorie elle-même
            await category.useTransaction(trx).delete();
            // --- Fin logique métier ---

            await trx.commit(); // Commit avant suppression fichiers

            // 4. Supprimer les fichiers associés
            try {
                await deleteFiles(category_id);
            } catch (fileError) {
                logger.error({ categoryId: category_id, error: fileError }, 'Failed to delete associated files after category deletion, but DB entry was removed.');
            }

            logger.info({ userId: auth.user!.id, categoryId: category_id }, 'Category deleted');
            // 🌍 i18n
            return response.ok({ message: "Catégorie supprimé(e) avec succès.", isDeleted: true }); // Nouvelle clé

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: auth.user!.id, categoryId: category_id, error: error.message, stack: error.stack }, 'Failed to delete category');
            if (error.code === 'E_ROW_NOT_FOUND') {
                // 🌍 i18n
                return response.notFound({ message: "Catégorie n'a pas été trouvé(e)." });
            }
            // 🌍 i18n
            return response.internalServerError({ message: "Erreur lors de la erreur lors de la suppression du/de la catégorie.", error: error.message }); // Nouvelle clé
        }
    }
}