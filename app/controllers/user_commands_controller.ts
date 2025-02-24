import Cart from '#models/cart'
import UserCommand, { OrderStatus, PaymentStatus } from '#models/user_command'
import UserCommandItem from '#models/user_command_item'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

export default class UserCommandsController {
    async create_user_command({ request, response ,auth }: HttpContext) {
        const user =  await auth.authenticate()

        // const userCommandItem = await UserCommandItem.findBy('user_id', user.id)
        let listItemsCommand  = (await db.from(UserCommandItem.table).where('user_id', user.id)) as UserCommandItem[]

        try {
            
            const data = request.only([
                'phoneNumber',
                'countryCode',
                'reference',
                'status',
                'paymentMethod',
                'paymentStatus',
                'currency',
                'totalPrice',
                'deliveryPrice',
                'returnDeliveryPrice',
                'withDelivery',
                'deliveryAddress',
                'deliveryAddressName',
                'deliveryDate',
                'deliveryLatitude',
                'deliveryLongitude',
                'pickupAddress',
                'pickupAddressName',
                'pickupDate',
                'pickupLatitude',
                'pickupLongitude',
              ])
              const command = await UserCommand.create({...data, userId: user.id ,status : OrderStatus.PENDING ,paymentStatus : PaymentStatus.PENDING})
              listItemsCommand.forEach(item => {
                  item.merge({
                      command_id : command.id,
                  })
                  item.save()
              })
            await Cart.query().where('user_id', user.id).delete()
              return response.created(command)
        } catch (error) {
            console.error('Create user command error:', error)
            return response.internalServerError({ message: 'Create failed', error: error.message })
        }
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