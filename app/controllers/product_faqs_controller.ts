import type { HttpContext } from '@adonisjs/core/http'
import Product from '#models/product'
import ProductFaq from '#models/product_faq'
import { v4 as uuidv4 } from 'uuid'
import db from '@adonisjs/lucid/services/db'
import vine from '@vinejs/vine'
import { Infer } from '@vinejs/vine/types'
import logger from '@adonisjs/core/services/logger'
import { t } from '../utils/functions.js' // Assure-toi que ce chemin est correct
import { TypeJsonRole } from '#models/role'
import { securityService } from '#services/SecurityService'

const EDIT_PERMISSION: keyof TypeJsonRole = 'edit_product';
const CREATE_DELETE_PERMISSION: keyof TypeJsonRole = 'create_delete_product';

export default class ProductFaqsController {

    private createFaqSchema = vine.compile(
        vine.object({
            product_id: vine.string().uuid(),
            title: vine.string().trim().minLength(3).maxLength(255),
            content: vine.string().trim().minLength(10).maxLength(2000), // Limite augmentée
            sources: vine.array(
                vine.object({
                    label: vine.string().trim().minLength(1).maxLength(100),
                    url: vine.string().url().maxLength(500),
                })
            ).optional().nullable(),
            group: vine.string().trim().maxLength(100).optional().nullable(),
            index: vine.number().min(0).optional(),
        })
    );

    private updateFaqSchema = vine.compile(
        vine.object({
            // product_id n'est pas modifiable directement ici, lié à la FAQ
            title: vine.string().trim().minLength(3).maxLength(255).optional(),
            content: vine.string().trim().minLength(10).maxLength(2000).optional(),
            sources: vine.array(
                vine.object({
                    label: vine.string().trim().minLength(1).maxLength(100),
                    url: vine.string().url().maxLength(500),
                })
            ).optional().nullable(),
            group: vine.string().trim().maxLength(100).optional().nullable(),
            index: vine.number().min(0).optional(),
        })
    );

    private listFaqsSchema = vine.compile(
        vine.object({
            product_id: vine.string().uuid(), // Requis pour lister les FAQs d'un produit
            group: vine.string().trim().maxLength(100).optional(),
            page: vine.number().min(1).optional(),
            limit: vine.number().min(1).max(100).optional(),
        })
    );

    private faqIdParamsSchema = vine.compile(
        vine.object({
            faqId: vine.string().uuid(), // ID de la FAQ dans l'URL pour get, update, delete
        })
    );

    /**
     * @createFaq
     * Create a new FAQ for a product.
     */
    async createFaq({ request, response, auth }: HttpContext) {
        const user = await securityService.authenticate({ request, auth });
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [EDIT_PERMISSION]);
        } catch (error) {
            return response.forbidden({ message: t('unauthorized_action') });
        }

        let payload: Infer<typeof this.createFaqSchema>;

        try {
            payload = await this.createFaqSchema.validate(request.body());
        } catch (error) {
            logger.warn({ validationErrors: error.messages, body: request.body() }, 'ProductFaq creation validation failed');
            return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
        }
        console.log({ payload });

        const trx = await db.transaction();
        try {
            const product = await Product.find(payload.product_id, { client: trx });
            if (!product) {
                await trx.rollback();
                return response.notFound({ message: t('product.notFound') });
            }
            // TODO: Vérifier si l'utilisateur a le droit de modifier CE produit spécifique (si pas géré par un scope global)

            const maxIndexResult = await ProductFaq.query({ client: trx })
                .where('product_id', payload.product_id)
                .if(payload.group, (query) => query.where('group', payload.group!))
                .max('index as maxIdx')
                .first();

            const newIndex = payload.index ?? (maxIndexResult?.$extras.maxIdx !== null ? (maxIndexResult?.$extras.maxIdx || 0) + 1 : 0);

            const productFaq = await ProductFaq.create({
                id: uuidv4(),
                product_id: payload.product_id,
                title: payload.title,
                content: payload.content,
                sources: payload.sources || null,
                group: payload.group || null,
                index: newIndex,
            }, { client: trx });

            await trx.commit();
            logger.info({ userId: user.id, productFaqId: productFaq.id, productId: product.id }, 'ProductFaq created');
            return response.created({ message: t('productFaq.createdSuccess'), faq: productFaq });
        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user.id, productId: payload.product_id, error: error.message }, 'Failed to create ProductFaq');
            return response.internalServerError({ message: t('productFaq.creationFailed'), error: error.message });
        }
    }

    /**
     * @listFaqs
     * List FAQs for a specific product.
     * Publicly accessible (ou selon la visibilité du produit).
     */
    async listFaqs({ request, response }: HttpContext) {
        let payload: Infer<typeof this.listFaqsSchema>;
        try {
            payload = await this.listFaqsSchema.validate(request.qs());
        } catch (error) {
            logger.warn({ validationErrors: error.messages, query: request.qs() }, 'ProductFaq list validation failed');
            return response.badRequest({ message: t('validationFailed'), errors: error.messages });
        }

        try {
            // Vérifier si le produit parent existe (et est visible si c'est une route publique)
            const product = await Product.find(payload.product_id);
            if (!product /* || !product.is_visible */) { // Décommenter is_visible si la lecture est publique
                return response.notFound({ message: t('product.notFound') });
            }

            const query = ProductFaq.query().where('product_id', payload.product_id);

            if (payload.group) {
                query.where('group', payload.group);
            }

            query.orderBy('group', 'asc').orderBy('index', 'asc');

            const page = payload.page || 1;
            const limit = payload.limit || 20;
            const faqs = await query.paginate(page, limit);

            return response.ok({
                list: faqs.all(),
                meta: faqs.getMeta()
            }); // Retourne l'objet paginator
        } catch (error) {
            logger.error({ productId: payload.product_id, error: error.message }, 'Failed to list ProductFaqs');
            return response.internalServerError({ message: t('productFaq.fetchFailed'), error: error.message });
        }
    }

    /**
     * @getFaq
     * Get a specific FAQ by its ID.
     * Publicly accessible (ou selon la visibilité du produit).
     */
    async getFaq({ params: routeParams, response }: HttpContext) {
        let validatedParams: Infer<typeof this.faqIdParamsSchema>;
        try {
            validatedParams = await this.faqIdParamsSchema.validate(routeParams);
        } catch (error) {
            return response.badRequest({ message: t('validationFailed'), errors: error.messages });
        }

        try {
            const faq = await ProductFaq.query()
                .where('id', validatedParams.faqId)
                .preload('product') // Précharger le produit pour vérification de visibilité
                .first();

            if (!faq) {
                return response.notFound({ message: t('productFaq.notFound') });
            }
            // if (!faq.product /* || !faq.product.is_visible */) { // Vérif produit parent
            //   return response.notFound({ message: t('productFaq.notFound') }); // Masquer l'existence si produit non visible
            // }

            return response.ok(faq);
        } catch (error) {
            logger.error({ faqId: validatedParams.faqId, error: error.message }, 'Failed to get ProductFaq');
            return response.internalServerError({ message: t('productFaq.fetchOneFailed'), error: error.message });
        }
    }

    /**
     * @updateFaq
     * Update an existing FAQ.
     */
    async updateFaq({ params: routeParams, request, response, auth }: HttpContext) {
        const user = await securityService.authenticate({ request, auth });
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [EDIT_PERMISSION]);
        } catch (error) {
            return response.forbidden({ message: t('unauthorized_action') });
        }

        let validatedParams: Infer<typeof this.faqIdParamsSchema>;
        let payload: Infer<typeof this.updateFaqSchema>;
        try {
            validatedParams = await this.faqIdParamsSchema.validate(routeParams);
            payload = await this.updateFaqSchema.validate(request.body());
        } catch (error) {
            logger.warn({ validationErrors: error.messages, body: request.body(), params: routeParams }, 'ProductFaq update validation failed');
            return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
        }

        const trx = await db.transaction();
        try {
            const productFaq = await ProductFaq.find(validatedParams.faqId, { client: trx });
            if (!productFaq) {
                await trx.rollback();
                return response.notFound({ message: t('productFaq.notFound') });
            }
            // TODO: Vérifier si l'utilisateur a le droit de modifier la FAQ de CE produit spécifique

            // Si l'index ou le groupe change, il faut potentiellement réindexer les autres FAQs
            // Pour un MVP, une mise à jour simple de l'index. Une réindexation plus complexe peut être ajoutée.
            // Si l'index est explicitement fourni et différent de l'actuel, on doit gérer la réorganisation.
            // Pour cet exemple, on met à jour l'index tel quel. S'il y a des doublons d'index, le tri en front devra gérer.

            productFaq.merge({
                title: payload.title,
                content: payload.content,
                sources: payload.sources,
                group: payload.group,
                index: payload.index, // Si undefined, merge ne le changera pas
            });

            // Si l'index est explicitement mis à undefined ou null dans le payload et qu'on veut le réinitialiser
            if (payload.index === undefined && request.body().index === null) {
                productFaq.index = 0; // Ou une logique pour le remettre à la fin
            }


            await productFaq.save();
            await trx.commit();
            logger.info({ userId: user.id, productFaqId: productFaq.id }, 'ProductFaq updated');
            return response.ok({ message: t('productFaq.updateSuccess'), faq: productFaq });
        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user.id, faqId: validatedParams.faqId, error: error.message }, 'Failed to update ProductFaq');
            return response.internalServerError({ message: t('productFaq.updateFailed'), error: error.message });
        }
    }

    private reorderFaqsSchema = vine.compile(
        vine.object({
            product_id: vine.string().uuid(),
            faqs: vine.array(
                vine.object({
                    id: vine.string().uuid(),
                    index: vine.number().min(0),
                })
            ).minLength(1), // Il faut au moins un item pour réordonner
            group: vine.string().trim().maxLength(100).optional().nullable(), // Optionnel: pour réordonner au sein d'un groupe
        })
    );
    async reorderFaqs({ request, response, auth }: HttpContext) {
        const user = await securityService.authenticate({ request, auth });
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [EDIT_PERMISSION]);
        } catch (error) {
            return response.forbidden({ message: t('unauthorized_action') });
        }

        let payload: Infer<typeof this.reorderFaqsSchema>; // reorderFaqsSchema reste le même
        try {
            payload = await this.reorderFaqsSchema.validate(request.body());
        } catch (error) {
            logger.warn({ validationErrors: error.messages, body: request.body() }, 'ProductFaq reorder validation failed');
            return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
        }

        const trx = await db.transaction();
        try {
            const { product_id, faqs: partialReorderedFaqsData, group } = payload;

            const product = await Product.find(product_id, { client: trx });
            if (!product) {
                await trx.rollback();
                return response.notFound({ message: t('product.notFound') });
            }

            // 1. Récupérer TOUTES les FAQs existantes pour ce produit (et groupe si spécifié)
            const allCurrentFaqsQuery = ProductFaq.query({ client: trx })
                .where('product_id', product_id)
                .if(group, (q) => q.where('group', group!));

            const allCurrentFaqs = await allCurrentFaqsQuery.orderBy('index', 'asc'); // Important de les avoir triées par leur index actuel

            if (allCurrentFaqs.length === 0 && partialReorderedFaqsData.length > 0) {
                // Cas étrange : on essaie de réordonner des FAQs pour un produit qui n'en a pas (ou pas dans ce groupe)
                await trx.rollback();
                return response.badRequest({ message: t('productFaq.noFaqsToReorderInContext') }); // Nouvelle clé i18n
            }

            // 2. Vérifier que les IDs des FAQs partielles existent et appartiennent au contexte
            const partialFaqIds = partialReorderedFaqsData.map(f => f.id);
            const validPartialFaqs = allCurrentFaqs.filter(f => partialFaqIds.includes(f.id));

            if (validPartialFaqs.length !== partialReorderedFaqsData.length) {
                await trx.rollback();
                const existingIds = validPartialFaqs.map(f => f.id);
                const problematicIds = partialFaqIds.filter(id => !existingIds.includes(id));
                logger.warn({ productId: product_id, group, problematicIds }, "Attempt to reorder non-existent or mismatched FAQs.");
                return response.badRequest({ message: t('productFaq.mismatchInReorder') });
            }

            // 3. Construire la nouvelle liste ordonnée
            const totalFaqsInContext = allCurrentFaqs.length;
            const newOrder: (ProductFaq | null)[] = new Array(totalFaqsInContext).fill(null);

            // Placer les items de la requête partielle à leurs nouvelles positions
            // Gérer les conflits d'index si plusieurs items sont assignés au même nouvel index (le dernier gagne ici)
            for (const reorderedItem of partialReorderedFaqsData) {
                const faqToMove = allCurrentFaqs.find(f => f.id === reorderedItem.id);
                if (faqToMove) {
                    // S'assurer que l'index fourni est dans les limites
                    const targetIndex = Math.max(0, Math.min(reorderedItem.index, totalFaqsInContext - 1));
                    if (newOrder[targetIndex] !== null) {
                        // Conflit d'index: une FAQ a déjà été placée à cet index.
                        // Que faire ? Pour l'instant, on logue une alerte.
                        // Une stratégie pourrait être de décaler les suivantes, ou de rejeter.
                        // Pour un MVP, le "dernier qui écrit gagne" est plus simple si le front s'assure qu'il n'y a pas de doublon d'index.
                        logger.warn({ productId: product_id, targetIndex, existingFaqId: newOrder[targetIndex]?.id, newFaqId: faqToMove.id }, "Index conflict during reorder. Overwriting.");
                    }
                    newOrder[targetIndex] = faqToMove;
                }
            }

            // Remplir les "trous" avec les items non présents dans la requête partielle,
            // en maintenant leur ordre relatif.
            let currentNewOrderIndex = 0;
            for (const existingFaq of allCurrentFaqs) {
                // Si cette FAQ n'a pas déjà été placée par la requête partielle
                if (!newOrder.find(f => f?.id === existingFaq.id)) {
                    // Trouver le prochain slot vide dans newOrder
                    while (newOrder[currentNewOrderIndex] !== null && currentNewOrderIndex < totalFaqsInContext) {
                        currentNewOrderIndex++;
                    }
                    if (currentNewOrderIndex < totalFaqsInContext) {
                        newOrder[currentNewOrderIndex] = existingFaq;
                    } else {
                        // Ne devrait pas arriver si la logique est correcte et totalFaqsInContext est bien calculé
                        logger.error({ productId: product_id, existingFaqId: existingFaq.id }, "Ran out of slots during reorder fill. Logic error?");
                    }
                }
            }

            // Filtrer les nulls au cas où (ne devrait pas y en avoir si tout va bien)
            const finalList = newOrder.filter(f => f !== null) as ProductFaq[];
            if (finalList.length !== totalFaqsInContext) {
                logger.error({ productId: product_id, expected: totalFaqsInContext, actual: finalList.length }, "Final reordered list length mismatch.");
                // Potentiellement une erreur grave ici, mais on continue avec ce qu'on a.
            }


            // 4. Mettre à jour les index en base de données
            const updatePromises: Promise<any>[] = [];
            for (let i = 0; i < finalList.length; i++) {
                const faq = finalList[i];
                if (faq.index !== i) { // Mettre à jour seulement si l'index a changé
                    updatePromises.push(
                        ProductFaq.query({ client: trx })
                            .where('id', faq.id)
                            .update({ index: i })
                    );
                }
            }

            await Promise.all(updatePromises);
            await trx.commit();

            logger.info({ userId: user.id, productId: product_id, group }, 'ProductFaqs reordered successfully with partial list.');

            // Optionnel: Retourner la liste complète réordonnée
            const updatedFullList = await ProductFaq.query()
                .where('product_id', product_id)
                .if(group, (q) => q.where('group', group!)) // q_group au lieu de group
                .orderBy('index', 'asc')
                .paginate(1, totalFaqsInContext || 10); // Paginer pour cohérence

            return response.ok({ message: t('productFaq.reorderSuccess'), faqs: updatedFullList });

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user.id, productId: payload.product_id, error: error.message, stack: error.stack }, 'Failed to reorder ProductFaqs with partial list');
            return response.internalServerError({ message: t('productFaq.reorderFailed'), error: error.message });
        }
    }


    /**
     * @deleteFaq
     * Delete a FAQ.
     */
    async deleteFaq({ params: routeParams, response, request, auth }: HttpContext) {
        const user = await securityService.authenticate({ request, auth });
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [CREATE_DELETE_PERMISSION]);
        } catch (error) {
            return response.forbidden({ message: t('unauthorized_action') });
        }
 
        let validatedParams: Infer<typeof this.faqIdParamsSchema>;
        try {
            validatedParams = await this.faqIdParamsSchema.validate(routeParams);
        } catch (error) {
            return response.badRequest({ message: t('validationFailed'), errors: error.messages });
        }

        const trx = await db.transaction();
        try {
            const productFaq = await ProductFaq.find(validatedParams.faqId, { client: trx });
            if (!productFaq) {
                await trx.rollback();
                return response.notFound({ message: t('productFaq.notFound') });
            }
            // TODO: Vérifier si l'utilisateur a le droit de supprimer la FAQ de CE produit

            await productFaq.delete();
            await trx.commit();
            // Ici, on pourrait vouloir réindexer les FAQs restantes pour ce produit/groupe.
            logger.info({ userId: user.id, productFaqId: validatedParams.faqId }, 'ProductFaq deleted');
            return response.ok({ message: t('productFaq.deleteSuccess'), isDeleted: true });
        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user.id, faqId: validatedParams.faqId, error: error.message }, 'Failed to delete ProductFaq');
            return response.internalServerError({ message: t('productFaq.deleteFailed'), error: error.message });
        }
    }
}