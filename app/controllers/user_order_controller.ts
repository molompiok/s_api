import Cart from '#models/cart'
import UserOrder, { OrderStatus, PaymentMethod, PaymentStatus } from '#models/user_order'
import UserOrderItem from '#models/user_order_item'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { v4 } from 'uuid'
import { STORE_ID } from './Utils/ctrlManager.js'
import CartItem from '#models/cart_item'

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
        ])
      
        try {
          const user = await auth.authenticate()
      
          const cart = await Cart.query()
            .where('user_id', user.id)
            .preload('items', (query) =>
              query.preload('group_product', (query) => query.preload('product'))
            )
            .firstOrFail()
      
          if (!cart.items.length) {
            return response.status(400).json({ message: 'Le panier est vide' })
          }
      
          const order = await db.transaction(async (trx) => {
            const itemsTotalPrice = cart.items.reduce((sum, item) => {
              const productPrice = item.group_product.product?.price ?? 0
              return sum + item.quantity * (item.group_product.additional_price + productPrice)
            }, 0)
      
            const deliveryPrice = payload.delivery_price || 0
            const totalPrice = itemsTotalPrice + deliveryPrice
      
            const userOrderData = {
              id: v4(),
              store_id: STORE_ID,
              user_id: user.id,
              phone_number: payload.phone_number,
              formatted_phone_number: payload.formatted_phone_number,
              country_code: payload.country_code,
              reference: `CMD-${Date.now()}`,
              payment_status: PaymentStatus.PENDING,
              delivery_price: deliveryPrice,
              payment_method: PaymentMethod.CASH,
              currency: 'CFA',
              total_price: totalPrice,
              with_delivery: payload.with_delivery,
              status: OrderStatus.PENDING,
              delivery_address: payload.delivery_address,
              delivery_address_name: payload.delivery_address_name,
              delivery_date: payload.delivery_date,
              delivery_latitude: payload.delivery_latitude,
              delivery_longitude: payload.delivery_longitude,
              pickup_address: payload.pickup_address,
              pickup_address_name: payload.pickup_address_name,
              pickup_date: payload.pickup_date,
              pickup_latitude: payload.pickup_latitude,
              pickup_longitude: payload.pickup_longitude,
            }
      
            const userOrder = await UserOrder.create(userOrderData, { client: trx })
      
            const orderItems = cart.items.map((item) => ({
              id: v4(),
              order_id: userOrder.id,
              group_product_id: item.group_product.id,
              store_id: STORE_ID,
              status: OrderStatus.PENDING,
              quantity: item.quantity,
              price_unit: item.group_product.additional_price + (item.group_product.product?.price ?? 0),
              currency: 'CFA',
            }))
      
            await UserOrderItem.createMany(orderItems, { client: trx })
      
            await CartItem.query({ client: trx })
              .where('cart_id', cart.id)
              .delete()
      
            return userOrder
          })
      
          return response.status(201).json(order)
        } catch (error) {
          console.error('Erreur lors de la création de la commande :', error)
          return response.internalServerError({ message: 'Échec de la création', error: error.message })
        }
      }
    
    async get_orders({ params, auth, response }: HttpContext) {
        const user = await auth.authenticate()
        try {
            const order = await UserOrder.query()
                .where('user_id', user.id)
                // .where('id', params.id)
                .preload('items', (query) => {
                    query.preload('group_product', (query) => {
                        query.preload('product')
                    })
                })
                .firstOrFail()
    
            return response.status(200).json(order)
        } catch (error) {
            console.error('Erreur lors de la récupération de la commande :', error)
            return response.status(404).json({ message: 'Commande non trouvée', error: error.message })
        }
    }
    
    
    async get_users_orders({ response,  auth,request }: HttpContext) {
   await auth.authenticate()
        const { user_id, id, store_id } = request.qs()
        try {
            let query = UserOrder.query().preload('items', (query) => {
                query.preload('group_product', (query) => {
                    query.preload('product')
                })
            })
    
            if (user_id) query.where('user_id', user_id)
            if (id) query.where('id', id)
            if (store_id) query.where('store_id', store_id)
    
            const userOrders = await query
    
            return response.ok(userOrders)
        } catch (error) {
            console.error('Erreur lors de la récupération des commandes utilisateur :', error)
            return response.internalServerError({ message: 'Échec de la récupération', error: error.message })
        }
    }
    
    async update_user_order({ response,  auth,request }: HttpContext) {
   await auth.authenticate()
        const { user_order_id } = request.only(['user_order_id'])
        try {
            const order = await UserOrder.find(user_order_id)
    
            if (!order) {
                return response.notFound({ error: 'Commande non trouvée' })
            }
    
            const data = request.only(['status'])
            order.merge(data)
            await order.save()
    
            return response.ok(order)
        } catch (error) {
            console.error('Erreur lors de la mise à jour de la commande utilisateur :', error)
            return response.internalServerError({ message: 'Échec de la mise à jour', error: error.message })
        }
    }
    
    async delete_user_order({ response,  auth,request }: HttpContext) {
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