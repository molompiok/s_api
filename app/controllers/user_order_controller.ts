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
import { t } from '../utils/functions.js'; // ✅ Ajout de t
import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import logger from '@adonisjs/core/services/logger'; // Ajout pour logs
import { TypeJsonRole } from '#models/role' // Pour type permissions
import User, { RoleType } from '#models/user' // Pour déterminer le rôle de l'updater

// Permissions
const VIEW_OWN_ORDERS_PERMISSION = null; // Pas de permission spécifique, juste être authentifié
const VIEW_ALL_ORDERS_PERMISSION: keyof TypeJsonRole = 'filter_command';
const MANAGE_ORDERS_PERMISSION: keyof TypeJsonRole = 'manage_command';


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
             user_order_id: vine.string().uuid(),
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

        let query = UserOrder.query().preload('user'); // Précharger user par défaut

        if (with_items) {
            query = query.preload('items', (itemQuery) => itemQuery.preload('product', (productQuery) => productQuery.preload('features', (featureQuery) => featureQuery.preload('values'))));
        }

        // Filtrages
        if (user_id) query = query.where('user_id', user_id);
        if (id) query = query.where('id', id);
        if (statusInput) {
            try {
                let statusArray = typeof statusInput === 'string' ? JSON.parse(statusInput) : statusInput;
                if (Array.isArray(statusArray) && statusArray.length > 0) {
                    // Filtrer pour ne garder que les statuts valides de l'enum OrderStatus
                    const validStatuses = statusArray
                        .map(s => String(s).toLowerCase())
                        .filter(s => Object.values(OrderStatus).includes(s as OrderStatus));

                    if (validStatuses.length > 0) {
                       logger.debug({ validStatuses }, 'Filtering orders by status');
                       query = query.whereIn('status', validStatuses);
                    } else {
                        logger.warn({ statusInput }, "Invalid or empty status filter provided");
                    }
                }
            } catch (error) {
                logger.warn({ statusInput, error: error.message }, 'Failed to parse status filter');
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

    // Mettre à jour le statut d'une commande (admin/collaborateur)
    async update_user_order({ response, auth, request, bouncer }: HttpContext) {
         // 🔐 Authentification
         await auth.authenticate();
         const user = auth.user!; // Utilisateur effectuant l'action
         // 🛡️ Permissions
         try {
             await bouncer.authorize('collaboratorAbility', [MANAGE_ORDERS_PERMISSION]);
         } catch (error) {
             if (error.code === 'E_AUTHORIZATION_FAILURE') {
                  // 🌍 i18n
                 return response.forbidden({ message: t('unauthorized_action') });
             }
             throw error;
         }

        let payload: Infer<typeof this.updateOrderSchema>;
        try {
            // ✅ Validation Vine (Body)
            payload = await this.updateOrderSchema.validate(request.body());
        } catch (error) {
             if (error.code === 'E_VALIDATION_ERROR') {
                 // 🌍 i18n
                 return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
             }
             throw error;
        }

        const trx = await db.transaction(); // Transaction pour MAJ atomique
        try {
            const order = await UserOrder.find(payload.user_order_id, { client: trx });

            if (!order) {
                await trx.rollback();
                 // 🌍 i18n
                 return response.notFound({ message: t('order.notFound') }); // Nouvelle clé
            }

            // --- Logique métier ---
            // TODO: Ajouter la logique de validation des transitions de statut ici
            // Exemple simple: Ne pas permettre de revenir en arrière depuis 'delivered' ou 'canceled'
            const currentStatus = order.status;
            const newStatus = payload.status;
             if ([OrderStatus.DELIVERED, OrderStatus.CANCELED, OrderStatus.RETURNED].includes(currentStatus) && currentStatus !== newStatus) {
                  if (!(currentStatus === OrderStatus.DELIVERED && newStatus === OrderStatus.RETURNED)) { // Exception: livré peut devenir retourné
                    await trx.rollback();
                     // 🌍 i18n
                     return response.badRequest({ message: t('order.invalidStatusTransition', { from: currentStatus, to: newStatus }) }); // Nouvelle clé
                  }
             }

            // Déterminer le rôle de l'acteur
             let actorRole: EventStatus['user_role'] = 'collaborator'; // Défaut
             if (user.id === env.get('OWNER_ID')) {
                 actorRole = 'owner';
             } else if (user.id === order.user_id) {
                 actorRole = 'client'; // Théoriquement pas possible ici car protégé par Bouncer, mais sécurité
             }
             // Ajouter logique pour 'admin' ou 'supervisor' si nécessaire

            // Ajouter le nouvel événement de statut
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
                // Ajouter le nouvel event au début ou à la fin? Début est souvent plus logique
                events_status: [newEvent, ...(order.events_status || [])],
            });
            await order.save();
            // --- Fin logique métier ---

            await trx.commit();
            logger.info({ actorId: user.id, orderId: order.id, newStatus: newStatus }, 'Order status updated');

            // Recharger la commande avec les items pour la réponse
            const updatedCommand = await this._get_users_orders({ command_id: order.id, with_items: true });
            // Diffusion SSE
            transmit.broadcast(`store/${env.get('STORE_ID')}/update_command`, { id: order.id });

            // 🌍 i18n
            return response.ok({ message: t('order.updateSuccess'), order: updatedCommand.list[0] }); // Nouvelle clé

        } catch (error) {
            await trx.rollback();
            logger.error({ actorId: user.id, orderId: payload?.user_order_id, error: error.message, stack: error.stack }, 'Failed to update order status');
             // 🌍 i18n
             return response.internalServerError({ message: t('order.updateFailed'), error: error.message }); // Nouvelle clé
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