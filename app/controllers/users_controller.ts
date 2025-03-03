import User from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { applyOrderBy } from './Utils/query.js'

export default class UsersController {

  async get_users({ request, response, auth }: HttpContext) {
    const { user_id, store_id, name, order_by, page = 1, limit = 10 } = request.qs()

    const pageNum = Math.max(1, parseInt(page))
    const limitNum = Math.max(1, parseInt(limit))

    let query = db.from(User.table).select('*')

    if (store_id) {
      query = query.where('store_id', store_id)
    }
    if (user_id) {
      query = query.where('id', user_id)
    }
    if (name) {
      const searchTerm = `%${name.toLowerCase()}%`
      query.where((q) => {
        q.whereRaw('LOWER(users.name) LIKE ?', [searchTerm])
      })
    }
    if (order_by) {
      query = applyOrderBy(query, order_by, User.table)
    }
    const productsPaginate = await query.paginate(pageNum, limitNum)
    return response.ok({ list: productsPaginate.all(), meta: productsPaginate.getMeta() })
  }

}