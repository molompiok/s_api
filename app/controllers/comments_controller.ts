import Comment from '#models/comment';
import type { HttpContext } from '@adonisjs/core/http';
import { createFiles } from './Utils/media/CreateFiles.js';
import { v4 } from 'uuid';
import { EXT_IMAGE, MEGA_OCTET } from './Utils/ctrlManager.js';
import db from '@adonisjs/lucid/services/db';
import { applyOrderBy } from './Utils/query.js'; // Gardé tel quel
import { updateFiles } from './Utils/media/UpdateFiles.js';
import { deleteFiles } from './Utils/media/DeleteFiles.js';
import Product from '#models/product';
import transmit from '@adonisjs/transmit/services/main';
import env from '#start/env';
import UserOrderItem from '#models/user_order_item';
import vine from '@vinejs/vine'; // ✅ Ajout de Vine
import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import logger from '@adonisjs/core/services/logger'; // Ajout pour logs
import { TypeJsonRole } from '#models/role'; // Pour type permissions
import { normalizeStringArrayInput } from '../utils/functions.js'; // ✅ Ajout de normalize
import { securityService } from '#services/SecurityService';

// Permissions
const DELETE_ANY_COMMENT_PERMISSION: keyof TypeJsonRole = 'manage_command'; // Exemple: modérateur/admin peut supprimer n'importe quel commentaire

export default class CommentsController {

    // --- Schémas de validation Vine ---
    private createCommentSchema = vine.compile(
        vine.object({
            order_item_id: vine.string().uuid(),
            title: vine.string().trim().minLength(3).maxLength(124),
            description: vine.string().trim().maxLength(512).optional(), // Max length from original logic?
            rating: vine.number().min(1).max(5),
            views: vine.any().optional()
        })
    );

    private getCommentSchema = vine.compile(
        vine.object({
            order_item_id: vine.string().uuid(),
        })
    );

    private getCommentsSchema = vine.compile(
        vine.object({
            order_by: vine.string().trim().optional(),
            page: vine.number().positive().optional(),
            limit: vine.number().positive().optional(),
            comment_id: vine.string().uuid().optional(),
            product_id: vine.string().uuid().optional(),
            with_users: vine.boolean().optional(),
        })
    );

    private updateCommentSchema = vine.compile(
        vine.object({
            title: vine.string().trim().minLength(3).maxLength(124).optional(),
            description: vine.string().trim().maxLength(512).optional().nullable(),
            rating: vine.number().min(1).max(5).optional(),
            views: vine.any().optional(), // ✅ Utiliser any pour Vine, sera normalisé
        })
    );

    private commentIdParamsSchema = vine.compile(
        vine.object({
            id: vine.string().uuid(), // ID dans l'URL
        })
    );

    // --- Méthodes du contrôleur ---

    public async create_comment({ request, response, auth }: HttpContext) {
        // 🔐 Authentification (Seul un user connecté peut commenter un produit acheté)
        await securityService.authenticate({ request, auth });
        const user = auth.user!; // Garanti non null

        const trx = await db.transaction();
        const comment_id = v4();
        let payload: Infer<typeof this.createCommentSchema> = {} as any;
        try {
            // ✅ Validation Vine (Body)
            // Utiliser request.all() car createFiles a besoin des fichiers
            payload = await this.createCommentSchema.validate(request.all());

            // --- Logique métier ---
            const item = await UserOrderItem.find(payload.order_item_id);
            if (!item) {
                await trx.rollback();
                return response.notFound({ message: "L'élément de commande demandé n'a pas été trouvé." });
            }
            // Vérifier que l'item appartient bien à l'utilisateur connecté
            if (user.id !== item.user_id) {
                await trx.rollback();
                return response.forbidden({ message: "Vous ne pouvez pas commenter un élément de commande qui ne vous appartient pas." });
            }
            // Vérifier si un commentaire existe déjà pour cet item
            const existingComment = await Comment.query({ client: trx }) // Utiliser transaction
                .where('order_item_id', payload.order_item_id)
                .first();
            if (existingComment) {
                await trx.rollback();
                return response.conflict({ message: "Un commentaire existe déjà pour cet élément de commande." });
            }

            // Gestion fichiers 'views'
            const viewsUrls = await createFiles({
                request,
                column_name: "views",
                table_id: comment_id,
                table_name: Comment.table,
                options: {
                    throwError: true, compress: 'img', min: 0, max: 3,
                    extname: EXT_IMAGE, maxSize: 12 * MEGA_OCTET,
                },
            });

            const newComment = await Comment.create({
                id: comment_id,
                user_id: user.id,
                order_item_id: item.id,
                product_id: item.product_id, // Récupérer depuis l'item
                title: payload.title,
                description: payload.description ?? null, // Assurer null si absent
                rating: payload.rating,
                bind_name: item.bind_name, // Récupérer depuis l'item
                order_id: item.order_id,   // Récupérer depuis l'item
                views: viewsUrls,
            }, { client: trx });

            // Mettre à jour la note moyenne du produit
            const product = await Product.find(item.product_id, { client: trx });
            if (product) {
                const avgRatingResult = await Comment.query({ client: trx })
                    .where('product_id', item.product_id)
                    .avg('rating as average')
                    .count('* as comment_count')
                    .first();

                product.rating = avgRatingResult?.$extras.average ? parseFloat(avgRatingResult.$extras.average.toFixed(2)) : 0;
                product.comment_count = avgRatingResult?.$extras.comment_count ? parseInt(String(avgRatingResult.$extras.comment_count)) : 0;
                await product.useTransaction(trx).save(); // Sauver dans la transaction
                logger.debug({ productId: product.id, rating: product.rating, count: product.comment_count }, "Product rating updated");
            } else {
                logger.warn({ productId: item.product_id, orderItemId: item.id }, "Product not found when updating rating after comment creation");
            }

            await trx.commit();
            logger.info({ userId: user.id, commentId: newComment.id, productId: item.product_id }, 'Comment created');
            // Diffusion SSE
            transmit.broadcast(`store/${env.get('STORE_ID')}/comment`, { id: comment_id, event: 'create' });

            return response.created({ message: "Commentaire créé avec succès.", comment: newComment });

        } catch (error) {
            await trx.rollback();
            // Nettoyage fichiers
            await deleteFiles(comment_id).catch(delErr => logger.error({ commentIdAttempt: comment_id, error: delErr }, 'Failed to cleanup files after comment creation failure'));

            logger.error({ userId: user?.id, payload: payload, error: error.message, stack: error.stack }, 'Failed to create comment');
            if (error.code === 'E_VALIDATION_ERROR') {
                return response.unprocessableEntity({ message: "La validation des données a échoué.", errors: error.messages });
            }
            return response.internalServerError({ message: "Erreur lors de la création du commentaire.", error: error.message });
        }
    }

    // Récupérer le commentaire associé à un order_item (pour l'utilisateur qui a commandé)
    public async get_comment({ request, response, auth }: HttpContext) {
        // 🔐 Authentification (L'utilisateur doit être celui qui a passé la commande)
        await securityService.authenticate({ request, auth });
        const user = auth.user!;

        let payload: Infer<typeof this.getCommentSchema> = {} as any;
        try {
            // ✅ Validation Vine pour Query Params
            payload = await this.getCommentSchema.validate(request.qs());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                return response.badRequest({ message: "La validation des données a échoué.", errors: error.messages });
            }
            throw error;
        }

        try {
            // --- Logique métier ---
            const item = await UserOrderItem.find(payload.order_item_id);
            if (!item) {
                return response.notFound({ message: "L'élément de commande demandé n'a pas été trouvé." });
            }
            // Vérifier que l'utilisateur demande le commentaire de SON item
            if (user.id !== item.user_id) {
                // Retourner notFound plutôt que forbidden pour ne pas révéler l'existence de l'item
                return response.notFound({ message: "Le commentaire demandé n'a pas été trouvé pour cet élément." });
            }

            // 🔍 GET par ID (order_item_id)
            const comment = await Comment.query()
                .where('order_item_id', item.id)
                .first(); // Utiliser .first()

            // Pas de message i18n car on retourne le commentaire ou null
            // (Le code original retournait null si non trouvé, on garde ce comportement)
            return response.ok(comment || null);

        } catch (error) {
            logger.error({ userId: user.id, orderItemId: payload?.order_item_id, error: error.message, stack: error.stack }, 'Failed to get single comment');
            return response.internalServerError({ message: "Erreur lors de la récupération du commentaire.", error: error.message });
        }
    }

    // Récupérer une liste de commentaires (public ou filtré par produit)
    public async get_comments({ request, response }: HttpContext) {
        // Lecture publique, pas besoin d'authentification ou de permission ici
        let payload: Infer<typeof this.getCommentsSchema>;
        try {
            // ✅ Validation Vine pour Query Params
            payload = await this.getCommentsSchema.validate(request.qs());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                return response.badRequest({ message: "La validation des données a échoué.", errors: error.messages });
            }
            throw error;
        }

        try {
            // --- Logique métier ---
            // 🔍 GET par ID (comment_id)
            if (payload.comment_id) {
                const comment = await Comment.query()
                    .if(payload.with_users, (query) => query.preload('user')) // Précharger user si demandé
                    .where('id', payload.comment_id)
                    .first(); // Utiliser .first()

                if (!comment) {
                    return response.notFound({ message: "Le commentaire demandé n'a pas été trouvé." });
                }
                return response.ok(comment);
            }

            // Si pas de comment_id, lister et paginer
            let query = Comment.query().select('*'); // Commencer avec Lucid Query Builder

            if (payload.with_users) {
                query = query.preload('user');
            }
            if (payload.product_id) {
                query = query.where('product_id', payload.product_id);
            }

            const orderBy = payload.order_by || 'created_at_desc'; // Défaut
            query = applyOrderBy(query, orderBy, Comment.table);

            const page = payload.page ?? 1;
            const limit = payload.limit ?? 10;
            const commentsPaginate = await query.paginate(page, limit);

            // Pas de message i18n car on retourne les données
            return response.ok({ list: commentsPaginate.all(), meta: commentsPaginate.getMeta() });

        } catch (error) {
            logger.error({ params: payload, error: error.message, stack: error.stack }, 'Failed to get comments list');
            return response.internalServerError({ message: "Erreur lors de la récupération de la liste des commentaires.", error: error.message });
        }
    }

    public async update_comment({ request, response, auth, params }: HttpContext) {
        // 🔐 Authentification (l'utilisateur doit être celui qui a posté le commentaire)
        await securityService.authenticate({ request, auth });
        const user = auth.user!;
        let comment_id: string = params['id']; // ID validé

        const trx = await db.transaction();
        let payload: Infer<typeof this.updateCommentSchema> = {} as any;
        try {
            // ✅ Validation Vine (Body)
            // Utiliser request.all() pour updateFiles
            comment_id = (await this.commentIdParamsSchema.validate(params)).id;
            payload = await this.updateCommentSchema.validate(request.all());

            // --- Logique métier ---
            const comment = await Comment.find(comment_id, { client: trx });
            if (!comment) {
                await trx.rollback();
                return response.notFound({ message: "Le commentaire demandé n'a pas été trouvé." });
            }
            // Vérifier l'appartenance
            if (comment.user_id !== user.id) {
                await trx.rollback();
                return response.forbidden({ message: "Vous ne pouvez pas modifier le commentaire d'un autre utilisateur." });
            }

            // Gestion fichiers 'views'
            let updatedViewsUrls: string[] | undefined = undefined;
            if (payload.views !== undefined) { // Vérifier si clé existe
                let normalizedViews: string[] = [];
                try {
                    normalizedViews = normalizeStringArrayInput({ views: payload.views }).views;
                } catch (error) {
                    await trx.rollback();
                    return response.badRequest({ message: `La valeur du champ 'views' est invalide: ${payload.views}` });
                }
                updatedViewsUrls = await updateFiles({
                    request, table_name: Comment.table, table_id: comment_id,
                    column_name: 'views', lastUrls: comment.views || [],
                    newPseudoUrls: normalizedViews,
                    options: {
                        throwError: true, min: 0, max: 3, compress: 'img', // Garder max=3?
                        extname: EXT_IMAGE, maxSize: 12 * MEGA_OCTET,
                    },
                });
            }


            comment.useTransaction(trx);
            comment.merge({
                title: payload.title, // merge gère undefined
                rating: payload.rating,
                description: payload.description, // merge gère undefined/null
                ...(updatedViewsUrls !== undefined && { views: updatedViewsUrls }) // MAJ seulement si fourni
            });
            await comment.save();
            // --- Fin logique métier ---

            // Mettre à jour la note du produit si le rating a changé
            if (payload.rating !== undefined && payload.rating !== comment.rating) {
                const product = await Product.find(comment.product_id, { client: trx });
                if (product) {
                    const avgRatingResult = await Comment.query({ client: trx })
                        .where('product_id', comment.product_id)
                        .avg('rating as average')
                        .count('* as comment_count')
                        .first();
                    product.rating = avgRatingResult?.$extras.average ? parseFloat(avgRatingResult.$extras.average.toFixed(2)) : 0;
                    product.comment_count = avgRatingResult?.$extras.comment_count ? parseInt(String(avgRatingResult.$extras.comment_count)) : 0;
                    await product.useTransaction(trx).save();
                    logger.debug({ productId: product.id, rating: product.rating, count: product.comment_count }, "Product rating updated after comment update");
                }
            }


            await trx.commit();
            logger.info({ userId: user.id, commentId: comment.id }, 'Comment updated');
            // Diffusion SSE
            transmit.broadcast(`store/${env.get('STORE_ID')}/comment`, { id: comment_id, event: 'update' });

            return response.ok({ message: "Commentaire mis à jour avec succès.", comment: comment });

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user.id, commentId: comment_id, error: error.message, stack: error.stack }, 'Failed to update comment');
            if (error.code === 'E_VALIDATION_ERROR') {
                return response.unprocessableEntity({ message: "La validation des données a échoué.", errors: error.messages });
            }
            return response.internalServerError({ message: "Erreur lors de la mise à jour du commentaire.", error: error.message });
        }
    }

    // Supprimer un commentaire (soit l'auteur, soit un admin/modérateur)
    public async delete_comment({ params, request, response, auth }: HttpContext) {
        // 🔐 Authentification (on a besoin de savoir qui demande la suppression)
        await securityService.authenticate({ request, auth });
        const user = auth.user!;

        let payload: Infer<typeof this.commentIdParamsSchema>;
        try {
            // ✅ Validation Vine pour Params
            payload = await this.commentIdParamsSchema.validate(params);
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                return response.badRequest({ message: "La validation des données a échoué.", errors: error.messages });
            }
            throw error;
        }

        const comment_id = payload.id;
        const trx = await db.transaction();
        try {
            const comment = await Comment.find(comment_id, { client: trx });
            if (!comment) {
                await trx.rollback();
                return response.notFound({ message: "Le commentaire demandé n'a pas été trouvé." });
            }

            // 🛡️ Permissions : Vérifier si l'utilisateur est l'auteur OU a la permission de supprimer n'importe quel commentaire
            const isAuthor = comment.user_id === user.id;
            let canDelete = isAuthor; // L'auteur peut supprimer par défaut

            if (!isAuthor) {
                // Si pas l'auteur, vérifier la permission 'manage_command' (ou autre)
                try {
                    await request.ctx?.bouncer.authorize('collaboratorAbility', [DELETE_ANY_COMMENT_PERMISSION]);
                    canDelete = true; // Le modérateur peut supprimer
                } catch (bouncerError) {
                    if (bouncerError.code !== 'E_AUTHORIZATION_FAILURE') {
                        throw bouncerError; // Relancer si autre erreur
                    }
                    // Si E_AUTHORIZATION_FAILURE, canDelete reste false
                }
            }

            if (!canDelete) {
                await trx.rollback();
                return response.forbidden({ message: "Vous ne pouvez pas supprimer le commentaire d'un autre utilisateur." });
            }

            // --- Logique métier ---
            const productId = comment.product_id; // Sauvegarder avant suppression
            await comment.useTransaction(trx).delete();
            await deleteFiles(comment_id); // Nettoyer fichiers

            // Mettre à jour la note du produit APRES suppression
            const product = await Product.find(productId, { client: trx });
            if (product) {
                const avgRatingResult = await Comment.query({ client: trx })
                    .where('product_id', productId)
                    .avg('rating as average')
                    .count('* as comment_count')
                    .first();
                product.rating = avgRatingResult?.$extras.average ? parseFloat(avgRatingResult.$extras.average.toFixed(2)) : 0;
                product.comment_count = avgRatingResult?.$extras.comment_count ? parseInt(String(avgRatingResult.$extras.comment_count)) : 0;
                await product.useTransaction(trx).save();
                logger.debug({ productId: product.id, rating: product.rating, count: product.comment_count }, "Product rating updated after comment deletion");
            }
            // --- Fin logique métier ---

            await trx.commit();
            logger.info({ actorId: user.id, commentId: comment_id }, 'Comment deleted');
            // Diffusion SSE
            transmit.broadcast(`store/${env.get('STORE_ID')}/comment`, { id: comment_id, event: 'delete' });

            return response.ok({ message: "Commentaire supprimé avec succès." });

        } catch (error) {
            await trx.rollback();
            logger.error({ actorId: user.id, commentId: comment_id, error: error.message, stack: error.stack }, 'Failed to delete comment');
            return response.internalServerError({ message: "Erreur lors de la suppression du commentaire.", error: error.message });
        }
    }
}