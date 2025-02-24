import UserAddress from '#models/user_address'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { v4 } from 'uuid'

export default class UserAddressesController {
    async create_user_address({ request, response , auth }: HttpContext) {
       const user = await auth.authenticate()
       const id = v4()
       try {
        const { name, longitude, latitude } = request.only(['name', 'longitude', 'latitude'])

       if(!user) return response.unauthorized({ message: 'Unauthorized' })

       const user_address = await UserAddress.create({
            id,
            user_id: user.id,
            name,
            longitude,
            latitude
        })
        return response.created(user_address)
       } catch (error) {
        console.error('Create user address error:', error)
        return response.internalServerError({ message: 'Create failed', error: error.message })
       }
       

       
    }
    async get_user_address({ request, response , auth }: HttpContext) {
        const { user_id , id } = request.qs()
        // const user = await auth.authenticate()
 try {
    let query = db.from(UserAddress.table).select('*')

    if(user_id) query.where('user_id', user_id)

    if(id) query.where('id', id)

    const userAddresses = await query

    return response.ok(userAddresses)
 } catch (error) {
    console.error('Get user address error:', error)
    return response.internalServerError({ message: 'Get failed', error: error.message })
 }
    }   
    
    async update_user_address({ request, response , auth }: HttpContext) {
        const user = await auth.authenticate()
        const { name, longitude, latitude , user_address_id } = request.only(['name', 'longitude', 'latitude', 'user_address_id'])
        try {
            const user_address = await UserAddress.find(user_address_id)

            if(!user_address) return response.notFound({ message: 'User address not found' })
                
                if (user_address.user_id !== user.id) {
                    return response.forbidden({ message: 'Forbidden operation' })
                  }
              
            user_address.merge({
                name,
                longitude,
                latitude
            })

            await user_address.save()

            return response.ok(user_address)
            
        } catch (error) {
            console.error('Update user address error:', error)
            return response.internalServerError({ message: 'Update failed', error: error.message })
        }

        
    }
    
    async delete_user_address({ request, response ,auth }: HttpContext) {
        const user = await auth.authenticate()
        const user_address_id = request.param('id')

        try {
            if(!user_address_id){
                return response.badRequest({ message: 'Address ID is required' })
            }
            const address = await UserAddress.find(user_address_id)

            if(!address) return response.notFound({ message: 'Address not found' })
            
                if (address.user_id !== user.id) {
                    return response.forbidden({ message: 'Forbidden operation' })
                  }
              
            await address.delete()
            return response.ok({ isDeleted: address.$isDeleted })
        } catch (error) {
            console.error('Delete user address error:', error)
            return response.internalServerError({ message: 'Delete failed', error: error.message })
        }

        
    }
}