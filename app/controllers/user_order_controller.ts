import Cart from '#models/cart'
import UserCommand, { OrderStatus, PaymentMethod, PaymentStatus } from '#models/user_command'
import UserCommandItem from '#models/user_command_item'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { v4 } from 'uuid'
import { STORE_ID } from './Utils/ctrlManager.js'
import CartItem from '#models/cart_item'
import Product from '#models/product'

export default class UserCommandsController {
    async create_user_command({  response ,auth }: HttpContext) {
        const user =  await auth.authenticate()
        try {
            
              const cart = await Cart.query()
                .where('user_id', user.id)
                .preload('items', (query) => query.preload('group_product'))
                .firstOrFail()

                if (!cart.items.length) {
                    return response.status(400).json({ message: 'Le panier est vide' })
                  }
                  const order = await db.transaction(async (trx) => {
                    const totalPrice = (
                      await Promise.all(
                        cart.items.map(async (item) => {
                          const product = await Product.find(item.group_product.product_id)
                          return item.quantity * (item.group_product.additional_price + (product?.price ?? 0))
                        })
                      )
                    ).reduce((sum, value) => sum + value, 0)
            
                    const userCommand = await UserCommand.create(
                      {
                        id: v4(),
                        store_id: STORE_ID,
                        user_id: user.id,
                        reference: `CMD-${Date.now()}`,
                        payment_status: PaymentStatus.PENDING,
                        payment_method: PaymentMethod.CASH,
                        currency: 'CFA',
                        total_price: totalPrice,
                        with_delivery: true,
                      },
                      { client: trx }
                    )
                    const commandItems = await Promise.all(
                        cart.items.map(async (item) => {
                          const product = await Product.find(item.group_product.product_id)
                          return {
                            id: v4(),
                            command_id: userCommand.id,
                            product_id: item.group_product.product_id,
                            store_id: STORE_ID,
                            status: OrderStatus.PENDING,
                            quantity: item.quantity,
                            price_unit: item.group_product.additional_price + (product?.price ?? 0),
                            currency: 'CFA',
                          }
                        })
                      )
          
                await UserCommandItem.createMany(commandItems, { client: trx })
              
                    await CartItem.query({ client: trx })
                      .where('cart_id', cart.id)
                      .delete()
              
                    return userCommand
                  })
              
                  return response.status(201).json({
                    message: 'Commande créée avec succès',
                    order,
                  })
        } catch (error) {
            console.error('Create user command error:', error)
            return response.internalServerError({ message: 'Create failed', error: error.message })
        }
    }
    async get_orders({ params, auth, response }: HttpContext) {
        const user = await auth.authenticate()
        const order = await UserCommand.query()
          .where('user_id', user.id)
          .where('id', params.id)
          .preload('items', (query) => {
            query.preload('group_product' , (query) => {
                query.preload('product')
            })
          })
          .firstOrFail()
    
        return response.status(200).json(order)
      }
    
    async get_user_commands({ response , request }: HttpContext) {
        const { user_id , id , store_id } = request.qs()
        try {
            let query = db.from(UserCommand.table).select('*')

            if(user_id) query.where('user_id', user_id)

            if(id) query.where('id', id)

            if(store_id) query.where('store_id', store_id)

            const userCommands = await query

            return response.ok(userCommands)
        } catch (error) {
            console.error('Get user commands error:', error)
            return response.internalServerError({ message: 'Get failed', error: error.message })
        }
    }

    async update_user_command({ response , request }: HttpContext) {
        const {user_command_id} = request.only(['user_command_id'])
        try {
            const command = await UserCommand.find(user_command_id)

            if (!command) {
                return response.notFound({ error: 'Commande non trouvée' })
            }
            const data = request.only([
                'status'
              ])
        
              command.merge(data)

            return response.ok(command)
        } catch (error) {
            console.error('Update user command error:', error)
            return response.internalServerError({ message: 'Update failed', error: error.message })
        }
    }

    async delete_user_command({ response , request  }: HttpContext) {
        const user_command_id = request.param('id')
        try {
            const command = await UserCommand.find(user_command_id)

            if (!command) {
                return response.notFound({ error: 'Commande non trouvée' })
            }

         await command.delete()
            return response.ok({ isDelete: command.$isDeleted })
        } catch (error) {
            console.error('Delete user command error:', error)
            return response.internalServerError({ message: 'Delete failed', error: error.message })
        }
    }
}