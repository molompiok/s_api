import Favorite from '#models/favorite';
import Product from '#models/product';
import type { HttpContext } from '@adonisjs/core/http';
import db from '@adonisjs/lucid/services/db';
import { v4 } from 'uuid';
import { applyOrderBy } from './Utils/query.js'; // Gardé tel quel
import vine from '@vinejs/vine'; // ✅ Ajout de Vine

import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import logger from '@adonisjs/core/services/logger'; // Ajout pour logs
import { securityService } from '#services/SecurityService';
import User from '#models/user';
import { TransactionClientContract } from '@adonisjs/lucid/types/database';
// Pas besoin de bouncer ici, les actions sont liées à l'utilisateur authentifié lui-même

export default class FavoritesController {

    // --- Schémas de validation Vine ---
    private createFavoriteSchema = vine.compile(
        vine.object({
            product_id: vine.string().uuid(),
        })
    );

    private getFavoritesSchema = vine.compile(
        vine.object({
            page: vine.number().positive().optional(),
            limit: vine.number().positive().optional(),
            order_by: vine.string().trim().optional(),
            favorite_id: vine.string().uuid().optional(),
            label: vine.string().trim().optional(),
            product_id: vine.string().uuid().optional(),
        })
    );

    private updateFavoriteSchema = vine.compile(
        vine.object({
            favorite_id: vine.string().uuid(),
            label: vine.string().trim().minLength(1).maxLength(100), // Ajout de limites raisonnables
        })
    );

    private deleteFavoriteParamsSchema = vine.compile(
        vine.object({
            id: vine.string().uuid(), // ID dans l'URL
        })
    );

    // --- Méthodes du contrôleur ---

    async create_favorite({ request, response, auth }: HttpContext) {
        // 🔐 Authentification (requise pour ajouter un favori)
        await securityService.authenticate({ request, auth });
        const user = auth.user!; // Garanti non null après authenticate

        const trx = await db.transaction();
        let payload: Infer<typeof this.createFavoriteSchema> = {} as any;
        try {
            // ✅ Validation Vine
            payload = await this.createFavoriteSchema.validate(request.body());

            // --- Logique métier ---
            const product = await Product.find(payload.product_id, { client: trx }); // Utiliser transaction
            if (!product) {
                // 🌍 i18n
                throw new Error("Le produit demandé n'a pas été trouvé.");
            }

            const existingFavorite = await Favorite.query({ client: trx }) // Utiliser transaction
                .where('user_id', user.id)
                .where('product_id', payload.product_id)
                .first();

            if (existingFavorite) {
                // 🌍 i18n
                throw new Error("Ce favori existe déjà."); // Nouvelle clé
            }

            const favorite = await Favorite.create({
                id: v4(),
                label: 'default', // Label par défaut à la création
                product_id: payload.product_id,
                user_id: user.id,
            }, { client: trx });

            await trx.commit();
            logger.info({ userId: user.id, favoriteId: favorite.id, productId: payload.product_id }, 'Favorite created');
            // 🌍 i18n
            return response.created({
                message: "Favori créé(e) avec succès.", // Nouvelle clé
                favorite: { favorite_id: favorite.id, product_name: product.name } // Garder le format original de réponse
            });

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user?.id, productId: payload?.product_id, error: error.message, stack: error.stack }, 'Failed to create favorite');
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: "La validation des données a échoué.", errors: error.messages })
            }
            if (error.message === "Le produit demandé n'a pas été trouvé." || error.message === "Ce favori existe déjà.") {
                // 🌍 i18n (Erreurs métier spécifiques)
                return response.badRequest({ message: error.message });
            }
            // 🌍 i18n
            return response.internalServerError({ message: "Erreur lors de la création du favori.", error: error.message }); // Nouvelle clé
        }
    }

    async get_favorites({ request, response, auth }: HttpContext) {
        // 🔐 Authentification (requise pour voir SES favoris)
        const bearerToken = request.header('Authorization')?.replace('Bearer ', '')

        logger.info('✅ENTRY bearerToken', bearerToken);

        if (!bearerToken) {
            return response.unauthorized({ error: 'Missing bearer token' })
        }

        logger.info('✅ENTRY Authentification (requise pour voir SES favoris)');
        await securityService.authenticate({ request, auth });
        const user = auth.user!;
        logger.info('✅ Authentification (requise pour voir SES favoris)', user);

        let payload: Infer<typeof this.getFavoritesSchema>;
        try {
            // ✅ Validation Vine pour Query Params
            payload = await this.getFavoritesSchema.validate(request.qs());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: "La validation des données a échoué.", errors: error.messages })
            }
            throw error;
        }

        try {
            // --- Logique métier (requête optimisée avec Lucid ORM) ---
            const pageNum = payload.page ?? 1;
            const limitNum = payload.limit ?? 10;

            let query = Favorite.query()
                .where('user_id', user.id) // Filtrer par l'utilisateur authentifié
                .preload('product'); // Précharger les détails du produit associé

            // 🔍 GET par ID (si fourni)
            if (payload.favorite_id) {
                // query = query.where('id', payload.favorite_id).first(); // Appliquer .first() pour GET par ID
                const favorite = await query.where('id', payload.favorite_id).limit(1);

                if (!favorite) {
                    // 🌍 i18n
                    return response.notFound({ message: "Favori n'a pas été trouvé(e)." }); // Nouvelle clé
                }
                // Retourner l'objet unique avec le produit préchargé
                return response.ok(favorite);
            }

            // Appliquer les filtres si pas de favorite_id
            if (payload.label) query = query.where('label', payload.label);
            if (payload.product_id) query = query.where('product_id', payload.product_id);
            if (payload.order_by) query = applyOrderBy(query, payload.order_by, Favorite.table); // applyOrderBy doit supporter les requêtes Lucid ORM

            const favoritesPaginate = await query.paginate(pageNum, limitNum);

            // Retourner la liste paginée (chaque favori aura son 'product' préchargé)
            return response.ok({ list: favoritesPaginate.all(), meta: favoritesPaginate.getMeta() });

        } catch (error) {
            logger.error({ userId: user.id, error: error.message, stack: error.stack }, 'Failed to get favorites');
            // 🌍 i18n
            return response.internalServerError({ message: "Erreur lors de la erreur lors de la récupération du/de la favori.", error: error.message }); // Nouvelle clé
        }
    }

    async update_favorites({ request, response, auth }: HttpContext) {
        // 🔐 Authentification
        await securityService.authenticate({ request, auth });
        const user = auth.user!;

        let payload: Infer<typeof this.updateFavoriteSchema> = {} as any;
        const trx = await db.transaction();
        try {
            // ✅ Validation Vine
            payload = await this.updateFavoriteSchema.validate(request.body());

            // --- Logique métier ---
            const favorite = await Favorite.find(payload.favorite_id, { client: trx });
            if (!favorite) {
                // 🌍 i18n
                throw new Error("Favori n'a pas été trouvé(e).");
            }
            // Vérifier que le favori appartient à l'utilisateur authentifié
            if (favorite.user_id !== user.id) {
                // 🌍 i18n
                throw new Error("Vous n'avez pas la permission d'effectuer cette action.");
            }

            favorite.useTransaction(trx);
            favorite.merge({ label: payload.label }); // Mettre à jour seulement le label
            await favorite.save();

            await trx.commit();
            logger.info({ userId: user.id, favoriteId: favorite.id }, 'Favorite updated');
            // 🌍 i18n
            return response.ok({ message: "Favori mis(e) à jour avec succès.", favorite: favorite }); // Nouvelle clé

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user.id, favoriteId: payload?.favorite_id, error: error.message, stack: error.stack }, 'Failed to update favorite');
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: "La validation des données a échoué.", errors: error.messages })
            }
            if (error.message === "Favori n'a pas été trouvé(e)." || error.message === "Vous n'avez pas la permission d'effectuer cette action.") {
                // 🌍 i18n
                const status = error.message === "Vous n'avez pas la permission d'effectuer cette action." ? 403 : 404;
                return response.status(status).send({ message: error.message });
            }
            // 🌍 i18n
            return response.internalServerError({ message: "Erreur lors de la erreur lors de la mise à jour du/de la favori.", error: error.message }); // Nouvelle clé
        }
    }

    public static async _delete_favorite(user:User,id:string,trx:TransactionClientContract) {
        

        // --- Logique métier ---
        const favorite = await Favorite.find(id, { client: trx });
        if (!favorite) {
            // 🌍 i18n
            throw new Error("Favori n'a pas été trouvé(e).");
        }
        // Vérifier que le favori appartient à l'utilisateur authentifié
        if (favorite.user_id !== user.id) {
            // 🌍 i18n
            throw new Error("Vous n'avez pas la permission d'effectuer cette action.");
        }

        await favorite.useTransaction(trx).delete();
    }
    async delete_favorite({ params, response, request, auth }: HttpContext) {
        // 🔐 Authentification
        await securityService.authenticate({ request, auth });
        const user = auth.user!;
        console.log({ favoriyesUser: user.$attributes });

        let payload: Infer<typeof this.deleteFavoriteParamsSchema> = {} as any;
        
        payload = await this.deleteFavoriteParamsSchema.validate(params);

        const trx = await db.transaction();
        try {
            // ✅ Validation Vine pour Params
            await FavoritesController._delete_favorite(user,payload.id,trx)
            await trx.commit();

            logger.info({ userId: user.id, favoriteId: payload.id }, 'Favorite deleted');
            // 🌍 i18n
            // Garder la réponse originale pour la cohérence avec le code précédent
            return response.ok({ message: "Favori supprimé(e) avec succès.", isDeleted: true }); // Nouvelle clé

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user.id, favoriteId: payload?.id, error: error.message, stack: error.stack }, 'Failed to delete favorite');
            if (error.message === "Favori n'a pas été trouvé(e)." || error.message === "Vous n'avez pas la permission d'effectuer cette action.") {
                // 🌍 i18n
                const status = error.message === "Vous n'avez pas la permission d'effectuer cette action." ? 403 : 404;
                return response.status(status).send({ message: error.message });
            }
            // 🌍 i18n
            return response.internalServerError({ message: "Erreur lors de la erreur lors de la suppression du/de la favori.", error: error.message }); // Nouvelle clé
        }
    }
}