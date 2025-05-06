import Cart from '#models/cart'
import UserOrder, { CURRENCY, OrderStatus, PaymentMethod, PaymentStatus, EventStatus } from '#models/user_order'
import UserOrderItem from '#models/user_order_item'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { v4 } from 'uuid'
// import { STORE_ID } from './Utils/ctrlManager.js' // STORE_ID est maintenant dans env
import CartItem from '#models/cart_item'
import { applyOrderBy } from './Utils/query.js' // Gardé tel quel
import { resizeImageToBase64 } from './Utils/media/getBase64.js' // Gardé tel quel
import { FeatureType } from '#models/feature'
import transmit from '@adonisjs/transmit/services/main'
import env from '#start/env'
import { DateTime } from 'luxon'
import vine from '@vinejs/vine'; // ✅ Ajout de Vine
import { normalizeStringArrayInput, t } from '../utils/functions.js'; // ✅ Ajout de t
import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import logger from '@adonisjs/core/services/logger'; // Ajout pour logs
import { TypeJsonRole } from '#models/role' // Pour type permissions

// Permissions
const VIEW_ALL_ORDERS_PERMISSION: keyof TypeJsonRole = 'filter_command';
const MANAGE_ORDERS_PERMISSION: keyof TypeJsonRole = 'manage_command';

const allowedTransitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
    [OrderStatus.PENDING]: [
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELED,
        OrderStatus.FAILED
    ],
    [OrderStatus.CONFIRMED]: [
        OrderStatus.PROCESSING,
        OrderStatus.CANCELED
    ],
    [OrderStatus.PROCESSING]: [
        OrderStatus.SHIPPED,           // Si livraison
        OrderStatus.READY_FOR_PICKUP,  // Si retrait
        OrderStatus.CANCELED,          // Si annulation permise ici
        OrderStatus.FAILED             // Si échec pendant préparation
    ],
    [OrderStatus.READY_FOR_PICKUP]: [
        OrderStatus.PICKED_UP,
        OrderStatus.NOT_PICKED_UP
    ],
    [OrderStatus.SHIPPED]: [
        OrderStatus.DELIVERED,
        OrderStatus.NOT_DELIVERED,
        OrderStatus.RETURNED, // Retour possible pendant transit? Rare.
        OrderStatus.FAILED    // Problème transport?
    ],
    [OrderStatus.DELIVERED]: [
        OrderStatus.RETURNED
    ],
     [OrderStatus.PICKED_UP]: [ // Ajouté : retour possible après retrait
        OrderStatus.RETURNED
    ],
    [OrderStatus.NOT_DELIVERED]: [ // Action après échec livraison
        OrderStatus.SHIPPED,    // Nouvelle tentative
        OrderStatus.RETURNED,   // Retour direct
        OrderStatus.CANCELED    // Annulation
    ],
    [OrderStatus.NOT_PICKED_UP]: [ // Action après non retrait
        OrderStatus.CANCELED    // Annulation après délai?
        // On pourrait aussi permettre de remettre en READY_FOR_PICKUP si le client prévient
    ],
    // CANCELED, RETURNED, FAILED sont finaux
};

export default class UserOrdersController {

    // --- Schémas de validation Vine ---
    private createOrderSchema = vine.compile(
        vine.object({
            delivery_price: vine.number().min(0).optional(),
            phone_number: vine.string().trim().minLength(5).maxLength(20), // Ajuster min/max si besoin
            formatted_phone_number: vine.string().trim().optional(),
            country_code: vine.string().trim().optional(),
            delivery_address: vine.string().trim().maxLength(500).optional(),
            delivery_address_name: vine.string().trim().maxLength(255).optional(),
            delivery_date: vine.string().optional(), // Valider format ISO date/heure
            delivery_latitude: vine.number().min(-90).max(90).optional(),
            delivery_longitude: vine.number().min(-180).max(180).optional(),
            pickup_address: vine.string().trim().maxLength(500).optional(),
            pickup_address_name: vine.string().trim().maxLength(255).optional(),
            pickup_date: vine.string().optional(),
            pickup_latitude: vine.number().min(-90).max(90).optional(),
            pickup_longitude: vine.number().min(-180).max(180).optional(),
            with_delivery: vine.boolean(),
            // total_price n'est pas validé car calculé côté serveur
        })
    );

    private getOrdersSchema = vine.compile(
        vine.object({
            order_by: vine.string().trim().optional(),
            page: vine.number().positive().optional(),
            limit: vine.number().positive().optional(),
        })
    );

    private getUsersOrdersSchema = vine.compile(
        vine.object({
            command_id: vine.string().uuid().optional(),
            id: vine.string().uuid().optional(), // alias pour command_id
            user_id: vine.string().uuid().optional(),
            order_by: vine.string().trim().optional(),
            page: vine.number().positive().optional(),
            product_id: vine.string().uuid().optional(),
            limit: vine.number().positive().optional(),
            status: vine.any().optional(), // Sera parsé/validé plus tard
            min_price: vine.number().min(0).optional(),
            max_price: vine.number().min(0).optional(),
            min_date: vine.string().optional(),
            max_date: vine.string().optional(),
            with_items: vine.boolean().optional(),
            search: vine.string().trim().optional(),
        })
    );

    private updateOrderSchema = vine.compile(
        vine.object({
            status: vine.enum(Object.values(OrderStatus)), // Valider contre l'enum
            message: vine.string().trim().maxLength(500).optional(),
            estimated_duration: vine.number().min(0).optional(), // en minutes? jours?
        })
    );

    private deleteOrderParamsSchema = vine.compile(
        vine.object({
            id: vine.string().uuid(), // ID de la commande dans l'URL
        })
    );

    // --- Méthodes du contrôleur ---

    async create_user_order({ request, response, auth }: HttpContext) {
        // 🔐 Authentification (Seul un utilisateur connecté peut créer une commande)
        await auth.authenticate();
        const user = auth.user!; // Garanti non null

        const trx = await db.transaction();
        let payload: Infer<typeof this.createOrderSchema>;
        try {
            // ✅ Validation Vine (Body)
            payload = await this.createOrderSchema.validate(request.body());

            // --- Logique métier ---
            const cart = await Cart.query({ client: trx }) // Utiliser transaction
                .where('user_id', user.id)
                .preload('items', (query) => query.preload('product'))
                .firstOrFail(); // Lance une erreur si le panier n'existe pas

            if (!cart.items.length) {
                await trx.rollback();
                // 🌍 i18n
                return response.badRequest({ message: t('order.cartEmpty') }); // Nouvelle clé
            }

            const itemsTotalPrice = await cart.getTotal(trx); // Utiliser transaction
            // Utiliser le prix validé ou 0 par défaut
            const deliveryPrice = payload.delivery_price ?? 0;
            const totalPrice = itemsTotalPrice + deliveryPrice;

            const isDelivery = payload.with_delivery; // Déjà booléen grâce à Vine
            const id = v4();
            let items_count = 0;
            cart.items.forEach((item) => {
                items_count += item.quantity;
            });

            // Création de la commande
            const userOrder = await UserOrder.create({
                id,
                user_id: user.id,
                phone_number: payload.phone_number,
                formatted_phone_number: payload.formatted_phone_number,
                country_code: payload.country_code,
                reference: `ref-${id.substring(0, id.indexOf('-') ?? 8)}`, // Substring plus sûr
                payment_status: PaymentStatus.PENDING,
                delivery_price: deliveryPrice,
                payment_method: PaymentMethod.CASH, // Méthode par défaut? Doit être configurable plus tard
                currency: CURRENCY.FCFA, // Devise par défaut? Doit être configurable
                total_price: totalPrice,
                with_delivery: isDelivery,
                status: OrderStatus.PENDING,
                items_count,
                events_status: [{
                    change_at: DateTime.now(),
                    status: OrderStatus.PENDING,
                    user_provide_change_id: user.id,
                    user_role: 'client' // L'utilisateur qui passe la commande est 'client'
                } as EventStatus], // Cast pour type safety
                ...(isDelivery
                    ? { // Champs pour livraison
                        delivery_address: payload.delivery_address,
                        delivery_address_name: payload.delivery_address_name,
                        delivery_date: payload.delivery_date ? DateTime.fromISO(payload.delivery_date) : undefined, // Convertir en DateTime
                        delivery_latitude: payload.delivery_latitude,
                        delivery_longitude: payload.delivery_longitude,
                        pickup_address: undefined, pickup_address_name: undefined, pickup_date: undefined,
                        pickup_latitude: undefined, pickup_longitude: undefined,
                    }
                    : { // Champs pour retrait
                        delivery_address: undefined, delivery_address_name: undefined, delivery_date: undefined,
                        delivery_latitude: undefined, delivery_longitude: undefined,
                        pickup_address: payload.pickup_address,
                        pickup_address_name: payload.pickup_address_name,
                        pickup_date: payload.pickup_date ? DateTime.fromISO(payload.pickup_date) : undefined, // Convertir en DateTime
                        pickup_latitude: payload.pickup_latitude,
                        pickup_longitude: payload.pickup_longitude,
                    }),
            }, { client: trx });

            // Création des items de la commande (logique inchangée)
            const orderItems = await Promise.all(cart.items.map(async (item) => {
                const option = item.product ? await CartItem.getBindOptionFrom(item.bind, { id: item.product_id }) : null;
                let bindJson = '{}';
                let bindNameJson = '{}';
                try { bindJson = JSON.stringify(option?.realBind || {}); } catch (e) { logger.warn({ cartItemId: item.id, error: e }, "Failed to stringify realBind"); }
                const b: any = {};
                try {
                    if (option?.bindName) {
                        for (const [f_name, value] of Object.entries(option.bindName)) {
                            const type = f_name.split(':')[1];
                            if (type && [FeatureType.ICON, FeatureType.ICON_TEXT].includes(type as any)) {
                                try {
                                    const icon = value.icon?.[0] ? [await resizeImageToBase64('.' + value.icon[0])] : [];
                                    b[f_name] = { ...value, icon };
                                } catch (resizeError) {
                                    logger.warn({ cartItemId: item.id, valueIcon: value.icon?.[0], error: resizeError }, "Failed to resize image for bind_name");
                                    b[f_name] = value; // Garder l'original sans image base64
                                }
                            } else {
                                b[f_name] = value;
                            }
                            // Retirer les champs inutiles pour bind_name
                            delete b?.views;
                            delete b?.index;
                        }
                    }
                    bindNameJson = JSON.stringify(b || {});
                } catch (e) { logger.warn({ cartItemId: item.id, error: e }, "Failed to stringify bindName"); }

                return {
                    id: v4(), order_id: userOrder.id, user_id: user.id, product_id: item.product_id,
                    bind: bindJson, bind_name: bindNameJson, status: OrderStatus.PENDING, quantity: item.quantity,
                    price_unit: (option?.additional_price ?? 0) + (item.product?.price ?? 0),
                    currency: CURRENCY.FCFA, // Utiliser devise de la commande?
                };
            }));

            await UserOrderItem.createMany(orderItems, { client: trx });
            // Vider le panier après la commande
            await CartItem.query({ client: trx }).where('cart_id', cart.id).delete();

            await trx.commit();
            logger.info({ userId: user.id, orderId: userOrder.id }, 'Order created successfully');
            // Diffusion SSE
            transmit.broadcast(`store/${env.get('STORE_ID')}/new_command`, { id: userOrder.id });

            // 🌍 i18n
            return response.created({ message: t('order.createdSuccess'), order: userOrder }); // Nouvelle clé

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user?.id, error: error.message, stack: error.stack }, 'Failed to create order');
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
            }
            if (error.code === 'E_ROW_NOT_FOUND') { // Si firstOrFail échoue sur Cart
                // 🌍 i18n
                return response.notFound({ message: t('order.cartNotFound') }); // Nouvelle clé
            }
            // 🌍 i18n
            return response.internalServerError({ message: t('order.creationFailed'), error: error.message }); // Nouvelle clé
        }
    }

    // Récupérer SES propres commandes
    async get_orders({ auth, response, request }: HttpContext) {
        // 🔐 Authentification
        await auth.authenticate();
        const user = auth.user!;

        let payload: Infer<typeof this.getOrdersSchema>;
        try {
            // ✅ Validation Vine pour Query Params
            payload = await this.getOrdersSchema.validate(request.qs());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: t('validationFailed'), errors: error.messages });
            }
            throw error;
        }

        try {
            // --- Logique métier ---
            const page = payload.page ?? 1;
            const limit = payload.limit ?? 10; // Limite plus raisonnable par défaut

            let query = UserOrder.query()
                .where('user_id', user.id) // Filtrer par utilisateur authentifié
                .preload('items', (itemQuery) => itemQuery.preload('product')); // Précharger items et produits

            const orderBy = payload.order_by || 'created_at_desc'; // Défaut à created_at desc
            query = applyOrderBy(query, orderBy, UserOrder.table);

            const orders = await query.paginate(page, limit);

            // Pas de message i18n car on retourne les données
            return response.ok({
                list: orders.all(),
                meta: orders.getMeta()
            });

        } catch (error) {
            logger.error({ userId: user.id, error: error.message, stack: error.stack }, 'Failed to get user orders');
            // 🌍 i18n
            return response.internalServerError({ message: t('order.fetchFailed'), error: error.message }); // Nouvelle clé
        }
    }

    // Méthode privée pour récupérer les commandes (pour le owner/collaborateur)
    // Logique métier largement inchangée, mais ajout de validation interne des status
    async _get_users_orders(params: Infer<typeof this.getUsersOrdersSchema>) { // Utiliser le type validé

        const { command_id, id: paramId, user_id, order_by = 'created_at_desc', page, product_id,
            limit, status: statusInput, min_price, max_price, min_date, max_date,
            with_items, search } = params;

        const id = paramId ?? command_id; // Utiliser alias
        let normalizedStatusInput: string[] | undefined = undefined;
        if (statusInput) {
            try {
                normalizedStatusInput = normalizeStringArrayInput({ statusInput}).statusInput;
            } catch (error) {}
        }
        let query = UserOrder.query().preload('user'); // Précharger user par défaut

        if (with_items) {
            query = query.preload('items', (itemQuery) => itemQuery.preload('product', (productQuery) => productQuery.preload('features', (featureQuery) => featureQuery.preload('values'))));
        }

        // Filtrages
        if (user_id) query = query.where('user_id', user_id);
        if (id) query = query.where('id', id);
        if (normalizedStatusInput) {
            try {
                let statusArray = typeof normalizedStatusInput === 'string' ? JSON.parse(normalizedStatusInput) : normalizedStatusInput;
                if (Array.isArray(statusArray) && statusArray.length > 0) {
                    // Filtrer pour ne garder que les statuts valides de l'enum OrderStatus
                    const validStatuses = statusArray
                        .map(s => String(s).toLowerCase())
                        .filter(s => Object.values(OrderStatus).includes(s as OrderStatus));

                    if (validStatuses.length > 0) {
                        logger.debug({ validStatuses }, 'Filtering orders by status');
                        query = query.whereIn('status', validStatuses);
                    } else {
                        logger.warn({ normalizedStatusInput }, "Invalid or empty status filter provided");
                    }
                }
            } catch (error) {
                logger.warn({ normalizedStatusInput, error: error.message }, 'Failed to parse status filter');
            }
        }
        if (product_id) query.whereHas('items', (q) => q.where('product_id', product_id));
        if (min_price) query.where('total_price', '>=', min_price);
        if (max_price) query.where('total_price', '<=', max_price);
        if (min_date) query.where('created_at', '>=', min_date);
        if (max_date) query.where('created_at', '<=', max_date);

        // Recherche
        if (search) {
            if (search.startsWith('#')) {
                let s = search.substring(1).toLowerCase() + '%';
                query = query.where((q) => {
                    q.whereRaw('LOWER(CAST(id AS TEXT)) LIKE ?', [s])
                        .orWhereRaw('LOWER(CAST(user_id AS TEXT)) LIKE ?', [s])
                        .orWhereILike('reference', s); // Ajouter référence
                });
            } else {
                let s = `%${search.toLowerCase()}%`;
                query = query.where((q) => {
                    // Recherche sur nom/email/téléphone client OU référence commande
                    q.whereILike('reference', s)
                        .orWhereILike('phone_number', s) // Ajouter téléphone
                        .orWhereHas('user', (u) => {
                            u.whereILike('full_name', s).orWhereILike('email', s);
                        });
                });
            }
        }

        query = applyOrderBy(query, order_by, UserOrder.table);

        const pageNum = page ?? 1;
        const limitNum = limit ?? 20;
        const commands = await query.paginate(pageNum, limitNum);

        return {
            list: commands.all(),
            meta: commands.getMeta()
        };
    }

    // Récupérer les commandes (vue admin/collaborateur)
    async get_users_orders({ response, auth, request, bouncer }: HttpContext) {
        // 🔐 Authentification
        await auth.authenticate();
        // 🛡️ Permissions
        try {
            await bouncer.authorize('collaboratorAbility', [VIEW_ALL_ORDERS_PERMISSION]);
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') });
            }
            throw error;
        }

        let payload: Infer<typeof this.getUsersOrdersSchema>;
        try {
            // ✅ Validation Vine pour Query Params
            payload = await this.getUsersOrdersSchema.validate(request.qs());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: t('validationFailed'), errors: error.messages });
            }
            throw error;
        }

        try {
            // Appel méthode privée avec params validés
            const commands = await this._get_users_orders(payload);
            // Pas de message i18n car on retourne les données
            return response.ok(commands);

        } catch (error) {
            logger.error({ userId: auth.user!.id, params: payload, error: error.message, stack: error.stack }, 'Failed to get users orders');
            // 🌍 i18n
            return response.internalServerError({ message: t('order.fetchAllFailed'), error: error.message }); // Nouvelle clé
        }
    }

    async update_user_order({ response, auth, request, bouncer , params}: HttpContext) {
        // 🔐 Authentification & 🛡️ Permissions (inchangé)
       
        const user =  await auth.authenticate();;
        try {
            await bouncer.authorize('collaboratorAbility', [MANAGE_ORDERS_PERMISSION]);
        } catch (error) { // ... gestion erreur permission
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                return response.forbidden({ message: t('unauthorized_action') });
            }
            throw error;
        }

        const order_id = params['id'];
        let payload: Infer<typeof this.updateOrderSchema>;
        try {
            payload = await this.updateOrderSchema.validate(request.body());
        } catch (error) { // ... gestion erreur validation
            if (error.code === 'E_VALIDATION_ERROR') {
                return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
            }
            throw error;
        }

        const trx = await db.transaction();
        try {
            const order = await UserOrder.find(order_id, { client: trx });

            if (!order) {
                await trx.rollback();
                return response.notFound({ message: t('order.notFound') });
            }

            const currentStatus = order.status;
            const newStatus = payload.status;

            // --- ✅ Vérification de la Transition ---
            // Si le statut actuel et le nouveau statut sont identiques, ne rien faire (succès silencieux?)
            if (currentStatus === newStatus) {
                 await trx.rollback(); // Pas besoin de transaction si rien ne change
                 logger.warn({ actorId: user.id, orderId: order.id, status: currentStatus }, 'Order status update requested but status is already the same.');
                 // On peut retourner OK avec un message spécifique ou la commande actuelle
                 const currentCommandData = await this._get_users_orders({ command_id: order.id, with_items: true });
                 return response.ok({ message: t('order.statusAlreadySet'), order: currentCommandData.list[0] }); // Nouvelle clé i18n
            }

            // Vérifier si la transition est autorisée dans notre map
            const isValidTransition = allowedTransitions[currentStatus]?.includes(newStatus);

            if (!isValidTransition) {
                await trx.rollback();
                logger.warn({ actorId: user.id, orderId: order.id, from: currentStatus, to: newStatus }, 'Invalid order status transition attempted');
                // 🌍 i18n
                return response.badRequest({ message: t('order.invalidStatusTransition', { from: t(`orderStatus.${currentStatus.toLowerCase()}`), to: t(`orderStatus.${newStatus.toLowerCase()}`) }) }); // Utiliser clés i18n pour les noms de statut
            }
             // --- Fin Vérification de la Transition ---


            // --- Logique métier (ajout de l'événement) ---
            let actorRole: EventStatus['user_role'] = 'collaborator'; // ... (logique de rôle inchangée)
            if (user.id === env.get('OWNER_ID')) actorRole = 'owner';
            else if (user.id === order.user_id) actorRole = 'client';


            const newEvent: EventStatus = {
                change_at: DateTime.now(),
                status: newStatus,
                user_provide_change_id: user.id,
                user_role: actorRole,
                estimated_duration: payload.estimated_duration,
                message: payload.message
            };

            order.useTransaction(trx).merge({
                status: newStatus,
                events_status: [...(order.events_status || []), newEvent],
            });
            await order.save();
            // --- Fin logique métier ---

            await trx.commit();
            logger.info({ actorId: user.id, orderId: order.id, from: currentStatus, to: newStatus }, 'Order status updated successfully');

            // Recharger et répondre (inchangé)
            const updatedCommand = await this._get_users_orders({ command_id: order.id, with_items: true });
            transmit.broadcast(`store/${env.get('STORE_ID')}/update_command`, { id: order.id });
            return response.ok({ message: t('order.updateSuccess'), order: updatedCommand.list[0] });

        } catch (error) { // ... gestion erreur interne
            await trx.rollback();
            logger.error({ actorId: user.id, orderId: order_id, error: error.message, stack: error.stack }, 'Failed to update order status');
            return response.internalServerError({ message: t('order.updateFailed'), error: error.message });
        }
    }
    // Supprimer une commande (admin/collaborateur)
    async delete_user_order({ params, response, auth, bouncer }: HttpContext) {
        // 🔐 Authentification
        await auth.authenticate();
        // 🛡️ Permissions
        try {
            // Utiliser la même permission que pour gérer les commandes?
            await bouncer.authorize('collaboratorAbility', [MANAGE_ORDERS_PERMISSION]);
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') });
            }
            throw error;
        }

        let payload: Infer<typeof this.deleteOrderParamsSchema>;
        try {
            // ✅ Validation Vine pour Params
            payload = await this.deleteOrderParamsSchema.validate(params);
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: t('validationFailed'), errors: error.messages });
            }
            throw error;
        }

        const user_order_id = payload.id;
        const trx = await db.transaction(); // Transaction pour suppression atomique
        try {
            const order = await UserOrder.find(user_order_id, { client: trx });

            if (!order) {
                await trx.rollback();
                // 🌍 i18n
                return response.notFound({ message: t('order.notFound') });
            }

            // Supprimer d'abord les items associés (bonne pratique, ou utiliser cascade DB)
            await UserOrderItem.query({ client: trx }).where('order_id', user_order_id).delete();
            // Supprimer la commande
            await order.useTransaction(trx).delete();

            await trx.commit();
            logger.info({ actorId: auth.user!.id, orderId: user_order_id }, 'Order deleted');
            // 🌍 i18n
            return response.ok({ message: t('order.deleteSuccess'), isDeleted: true }); // Nouvelle clé

        } catch (error) {
            await trx.rollback();
            logger.error({ actorId: auth.user!.id, orderId: user_order_id, error: error.message, stack: error.stack }, 'Failed to delete order');
            // 🌍 i18n
            return response.internalServerError({ message: t('order.deleteFailed'), error: error.message }); // Nouvelle clé
        }
    }
}