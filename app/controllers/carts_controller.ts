import Cart from '#models/cart'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

export default class CartsController {

    async get_cart_items({ response , request }: HttpContext) {
        const { user_id , command_id , page = 1, limit = 30, } = request.qs()
        try {
            let query = db.from(Cart.table).select('*')

            if(user_id) query.where('user_id', user_id)

            if(command_id) query.where('command_id', command_id)

            const carts = await query.paginate(page, limit)

            return response.ok(carts)
        } catch (error) {
            return response.internalServerError({ message: 'Internal server error', error: error.message })
        }
    }
}