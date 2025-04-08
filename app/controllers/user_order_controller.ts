import Cart from '#models/cart'
import UserOrder, { CURRENCY, OrderStatus, PaymentMethod, PaymentStatus } from '#models/user_order'
import UserOrderItem from '#models/user_order_item'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { v4 } from 'uuid'
import { STORE_ID } from './Utils/ctrlManager.js'
import CartItem from '#models/cart_item'
import { applyOrderBy } from './Utils/query.js'
import { resizeImageToBase64 } from './Utils/media/getBase64.js'
import { FeatureType } from '#models/feature'
import transmit from '@adonisjs/transmit/services/main'
import env from '#start/env'
import { DateTime } from 'luxon'

export default class UserOrdersController {
  async create_user_order({ response, auth, request }: HttpContext) {
    const payload = request.only([
      'delivery_price',
      'phone_number',
      'formatted_phone_number',
      'country_code',
      'delivery_address',
      'delivery_address_name',
      'delivery_date',
      'delivery_latitude',
      'delivery_longitude',
      'pickup_address',
      'pickup_address_name',
      'pickup_date',
      'pickup_latitude',
      'pickup_longitude',
      'with_delivery',
      'total_price',
    ]);
    console.log("🚀 ~ UserOrdersController ~ create_user_order ~ payload:", payload);

    const trx = await db.transaction();
    try {
      const user = await auth.authenticate();

      const cart = await Cart.query()
        .where('user_id', user.id)
        .preload('items', (query) => query.preload('product'))
        .firstOrFail();

      if (!cart.items.length) {
        await trx.rollback();
        return response.badRequest({ message: 'Le panier est vide' });
      }

      const itemsTotalPrice = await cart.getTotal(trx);
      const deliveryPrice = parseInt(payload.delivery_price || '0', 10);
      const totalPrice = itemsTotalPrice + deliveryPrice; // Ou parseInt(payload.total_price, 10)

      const isDelivery = payload.with_delivery === 'true' || payload.with_delivery === true;
      const id = v4()
      let items_count = 0 
      cart.items.forEach((item)=>{
        items_count += item.quantity
      })
      const userOrder = await UserOrder.create({
        id,
        user_id: user.id,
        phone_number: payload.phone_number,
        formatted_phone_number: payload.formatted_phone_number,
        country_code: payload.country_code,
        reference: `ref-${id.substring(0, id.indexOf('-'))}`,
        payment_status: PaymentStatus.PENDING,
        delivery_price: deliveryPrice,
        payment_method: PaymentMethod.CASH,
        currency: CURRENCY.FCFA,
        total_price: totalPrice,// TODO le total des price doit etre recalculer apres chaque chagement de stats. le cout total ne prends pas en compte les produit retournee 
        with_delivery: isDelivery,
        status: OrderStatus.PENDING,
        items_count,
        events_status: [{
          change_at: DateTime.now(),
          status: OrderStatus.PENDING,
          user_provide_change_id: user.id,
          user_role: 'client'
        }],
        ...(isDelivery
          ? {
            delivery_address: payload.delivery_address,
            delivery_address_name: payload.delivery_address_name,
            delivery_date: payload.delivery_date,
            delivery_latitude: parseFloat(payload.delivery_latitude),
            delivery_longitude: parseFloat(payload.delivery_longitude),
            pickup_address: undefined,
            pickup_address_name: undefined,
            pickup_date: undefined,
            pickup_latitude: undefined,
            pickup_longitude: undefined,
          }
          : {
            delivery_address: undefined,
            delivery_address_name: undefined,
            delivery_date: undefined,
            delivery_latitude: undefined,
            delivery_longitude: undefined,
            pickup_address: payload.pickup_address,
            pickup_address_name: payload.pickup_address_name,
            pickup_date: payload.pickup_date,
            pickup_latitude: parseFloat(payload.pickup_latitude),
            pickup_longitude: parseFloat(payload.pickup_longitude),
          }),
      }, { client: trx });

      const orderItems = await Promise.all(cart.items.map(async (item) => {
        const option = item.product ? await CartItem.getBindOptionFrom(item.bind, { id: item.product_id }) : null;
        let bind = '{}';
        let bind_name = '{}';
        try {
          bind = JSON.stringify(option?.realBind || {});
        } catch (error) { }
        const b: any = {};
        try {
          if (option?.bindName) {
            console.log({ original_bindName: option?.bindName });
            for (const [f_name, value] of Object.entries(option.bindName)) {
              const type = f_name.split(':')[1];
              if (type && [
                FeatureType.ICON,
                FeatureType.ICON_TEXT
              ].includes(type as any)) {
                try {
                  const icon = value.icon?.[0] ? [await resizeImageToBase64('.' + value.icon[0])] : []
                  b[f_name] = { ...value, icon };
                } catch (error) { }
              } else {
                b[f_name] = value
              }
              (b?.views) && (b.views = undefined);
              (b?.index) && (b.index = undefined);
              console.log({ b });

            }
          }
          bind_name = JSON.stringify(b || {});
        } catch (error) {
          console.log(error);
        }
        return {
          id: v4(),
          order_id: userOrder.id,
          user_id: user.id,
          product_id: item.product_id,
          bind,
          bind_name,
          status: OrderStatus.PENDING,
          quantity: item.quantity,
          price_unit: (option?.additional_price ?? 0) + (item?.product?.price ?? 0),
          currency: CURRENCY.FCFA,
        };
      }));

      await UserOrderItem.createMany(orderItems, { client: trx });
      await CartItem.query({ client: trx }).where('cart_id', cart.id).delete();

      await trx.commit();
      transmit.broadcast(`store/${env.get('STORE_ID')}/new_command`, { id });

      return response.created(userOrder);
    } catch (error) {
      await trx.rollback();
      console.error('Erreur lors de la création de la commande :', error);
      return response.internalServerError({ message: 'Échec de la création', error: error.message });
    }
  }

  async get_orders({ auth, response, request }: HttpContext) {
    const user = await auth.authenticate()
    let {
      order_by = 'date_desc',
      page,
      limit } = request.qs()

    console.log({ order_by, page, limit })
    try {
      let query = UserOrder.query()
        .where('user_id', user.id)
        .preload('items', (query) => query.preload('product'))
      if (order_by) query = applyOrderBy(query, order_by, UserOrder.table)

      const orders = await query.paginate(page || 1, limit || 3)
      return response.ok({
        list: orders.all(),
        meta: orders.getMeta()
      })
    } catch (error) {
      console.error('Erreur lors de la récupération de la commande :', error)
      return response.notFound({ message: 'Commande non trouvée', error: error.message })
    }
  }
  async _get_users_orders({
    command_id,
    id,
    user_id,
    order_by = 'date_desc',
    page,
    product_id,
    limit,
    status,
    min_price,
    max_price,
    min_date,
    max_date,
    with_items,
    search }: any) {

    id = id ?? command_id

    let query = UserOrder.query().preload('user')
    if (with_items) {
      query = query.preload('items', (query) => query.preload('product', (query) => query.preload('features', (query) => query.preload('values'))))
    }
    // 🟢 **Filtrage dynamique**
    if (user_id) query = query.where('user_id', user_id)
    if (id) query = query.where('id', id)
    if (status) {
      try {
        // Si `status` est une chaîne, on tente de la parser en tableau
        if (typeof status === 'string') {
          status = JSON.parse(status)
        }

        // Vérifier que c'est bien un tableau non vide
        if (Array.isArray(status) && status.length > 0) {
          const lowerStatus = status.map((s) => s.toLowerCase())

          // Appliquer la condition WHERE en insensible à la casse
          console.log('📌 Filtrage par status :', lowerStatus)
          query = query.whereIn('status', lowerStatus)
        }
      } catch (error) {
        console.error('❌ Erreur lors du parsing de status :', error.message)
      }
    }
    if (product_id) query.whereHas('items', (q) => q.where('product_id', product_id))

    // 🟢 **Filtrer par prix**
    if (min_price) query.where('total_price', '>=', min_price)
    if (max_price) query.where('total_price', '<=', max_price)

    // 🟢 **Filtrer par date**
    if (min_date) query.where('created_at', '>=', min_date)
    if (max_date) query.where('created_at', '<=', max_date)

    // 🟢 **Recherche globale**
    if (search) {
      if (search.startsWith('#')) {
        let s = search.substring(1);
        s = `%${s}%`;
        query = query.where((q) => {
          q.whereRaw('CAST(id AS TEXT) LIKE ?', [s]) // Cast id to text
           .orWhereRaw('CAST(user_id AS TEXT) LIKE ?', [s]) // Cast user_id to text
          //  .orWhereHas('items', (q) => {
          //    q.whereRaw('CAST(product_id AS TEXT) LIKE ?', [s]); // Cast product_id to text
          //  });
        });
      } else {
        let s = `%${search}%`;
        query = query.where((q) => {
          q.orWhereHas('user', (u) => u.where('full_name', 'ilike', s));
        });
      }
    }

    if (order_by) query = applyOrderBy(query, order_by, UserOrder.table)

    const commands = await query.paginate(page || 1, limit || 20)
    return {
      list: commands.all(),
      meta: commands.getMeta()
    }

  }
  async get_users_orders({ response, auth, request }: HttpContext) {
    // await auth.authenticate()

    console.log(request.qs());
    try {

      const commands = await this._get_users_orders(request.qs());
      return response.ok(commands)
    } catch (error) {
      console.error('Erreur lors de la récupération des commandes utilisateur :', error)
      return response.internalServerError({ message: 'Échec de la récupération', error: error.message })
    }
  }

  async update_user_order({ response, auth, request }: HttpContext) {
    // const user = await auth.authenticate()
    const { message, user_order_id, status, estimated_duration } = request.only(['message', 'estimated_duration', 'user_order_id', 'status'])

    try {
      const order = await UserOrder.find(user_order_id)

      if (!order) {
        return response.notFound({ error: 'Commande non trouvée' })
      }
      const lowerStatus = Object.values(OrderStatus).map(v=>v.toLowerCase())
      if( !lowerStatus.includes(status?.toLowerCase())) {
        throw new Error(`Le status n'est valide, (${status}) non valide. Exemle de satuts (${lowerStatus.toString()})`);  
      }
      order.merge({
        status,
        events_status: [...(order.events_status || []), {
          change_at: DateTime.now(), 
          status: status.toLowerCase(),
          user_provide_change_id:'',
          user_role:'client',
          // user_provide_change_id: user.id,
          // user_role: user.id == order.user_id ? 'client' // todo
          //   : user.id == env.get('OWNER_ID') ? 'owner' : 'collaborator',
          estimated_duration,
          message
        }],
      })
      await order.save()
      
      const command = await this._get_users_orders({command_id:order.id,with_items:true})
      
      transmit.broadcast(`store/${env.get('STORE_ID')}/update_command`, { id:order.id });

      return response.ok(command.list[0])
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la commande utilisateur :', error)
      return response.internalServerError({ message: 'Échec de la mise à jour', error: error.message })
    }
  } 

  async delete_user_order({ response, auth, request }: HttpContext) {
    await auth.authenticate()
    const user_order_id = request.param('id')
    try {
      const order = await UserOrder.find(user_order_id)

      if (!order) {
        return response.notFound({ error: 'Commande non trouvée' })
      }

      await order.delete()
      return response.ok({ isDeleted: true })
    } catch (error) {
      console.error('Erreur lors de la suppression de la commande utilisateur :', error)
      return response.internalServerError({ message: 'Échec de la suppression', error: error.message })
    }
  }
}
