import Cart from '#models/cart'
import UserCommand, { OrderStatus, PaymentMethod, PaymentStatus } from '#models/user_command'
import UserCommandItem from '#models/user_command_item'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { v4 } from 'uuid'
import { STORE_ID } from './Utils/ctrlManager.js'
import CartItem from '#models/cart_item'

export default class UserCommandsController {
    async create_user_command({ response, auth }: HttpContext) {
        const user = await auth.authenticate()
        try {
            const cart = await Cart.query()
                .where('user_id', user.id)
                .preload('items', (query) => query.preload('group_product', (query) => {
                    query.preload('product')
                }))
                .firstOrFail()
    
            if (!cart.items.length) {
                return response.status(400).json({ message: 'Le panier est vide' })
            }
    
            const order = await db.transaction(async (trx) => {
                const totalPrice = cart.items.reduce((sum, item) => {
                    const productPrice = item.group_product.product ? item.group_product.product.price : 0
                    return sum + item.quantity * (item.group_product.additional_price + productPrice)
                }, 0)
    
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
    
                const commandItems = cart.items.map((item) => ({
                    id: v4(),
                    command_id: userCommand.id,
                    product_id: item.group_product.product_id,
                    store_id: STORE_ID,
                    status: OrderStatus.PENDING,
                    quantity: item.quantity,
                    price_unit: item.group_product.additional_price + (item.group_product.product?.price ?? 0),
                    currency: 'CFA',
                }))
    
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
            console.error('Erreur lors de la création de la commande :', error)
            return response.internalServerError({ message: 'Échec de la création', error: error.message })
        }
    }
    
    async get_orders({ params, auth, response }: HttpContext) {
        const user = await auth.authenticate()
        try {
            const order = await UserCommand.query()
                .where('user_id', user.id)
                .where('id', params.id)
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
    
    
    async get_user_commands({ response,  auth,request }: HttpContext) {
   await auth.authenticate()
        const { user_id, id, store_id } = request.qs()
        try {
            let query = UserCommand.query().select('*')
    
            if (user_id) query.where('user_id', user_id)
            if (id) query.where('id', id)
            if (store_id) query.where('store_id', store_id)
    
            const userCommands = await query
    
            return response.ok(userCommands)
        } catch (error) {
            console.error('Erreur lors de la récupération des commandes utilisateur :', error)
            return response.internalServerError({ message: 'Échec de la récupération', error: error.message })
        }
    }
    
    async update_user_command({ response,  auth,request }: HttpContext) {
   await auth.authenticate()
        const { user_command_id } = request.only(['user_command_id'])
        try {
            const command = await UserCommand.find(user_command_id)
    
            if (!command) {
                return response.notFound({ error: 'Commande non trouvée' })
            }
    
            const data = request.only(['status'])
            command.merge(data)
            await command.save()
    
            return response.ok(command)
        } catch (error) {
            console.error('Erreur lors de la mise à jour de la commande utilisateur :', error)
            return response.internalServerError({ message: 'Échec de la mise à jour', error: error.message })
        }
    }
    
    async delete_user_command({ response,  auth,request }: HttpContext) {
   await auth.authenticate()
        const user_command_id = request.param('id')
    
        try {
            const command = await UserCommand.find(user_command_id)
    
            if (!command) {
                return response.notFound({ error: 'Commande non trouvée' })
            }
    
            await command.delete()
            return response.ok({ isDeleted: true })
        } catch (error) {
            console.error('Erreur lors de la suppression de la commande utilisateur :', error)
            return response.internalServerError({ message: 'Échec de la suppression', error: error.message })
        }
    }
    
}