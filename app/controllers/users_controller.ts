import User from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { applyOrderBy } from './Utils/query.js'
import Comment from '#models/comment'
import UserOrder from '#models/user_order'

export default class UsersController {

  async get_users({ request, response, auth }: HttpContext) {
    const { user_id, name, order_by, page = 1, limit = 10, role, with_client_stats } = request.qs()

    const pageNum = Math.max(1, parseInt(page))
    const limitNum = Math.max(1, parseInt(limit))

    let query = db.from(User.table).select('*')

    if (user_id) {
      query = query.where('id', user_id)
    }
    if (name) {
      const searchTerm = `%${name.toLowerCase().split(' ').join('%')}%`
      query.where((q) => {
        q.whereILike('users.name', searchTerm)
      })
    }
    if (order_by) {
      query = applyOrderBy(query, order_by, User.table)
    }
    const productsPaginate = await query.paginate(pageNum, limitNum)

    const list = productsPaginate.all()

    console.log(with_client_stats);
    if (with_client_stats) {
      
    const promises = list.map(user=>new Promise(async(rev)=>{
      const commentStat = await Comment.query()
      .where('user_id', user.id)
      .avg('rating as average')
      .count('id as comment_count')
      .first();
    const order_count = await UserOrder.query()
      .where('user_id', user.id).count('id as order_count').first();
    const orderStat = await UserOrder.query()
      .where('user_id', user.id)
      .andWhere('payment_status', 'pending')
      // .andWhere('payment_status','paid')
      .sum('total_price as sum_price')
      .sum('items_count as sum_item')
      .first(); 

    const stat = {
      avgRating: commentStat?.$extras.average ?parseFloat(commentStat?.$extras.average):0,
      commentsCount: commentStat?.$extras.comment_count ? parseInt(commentStat?.$extras.comment_count ): 0,
      productsBought: orderStat?.$extras.sum_item?parseInt(orderStat?.$extras.sum_item):0,
      ordersCount: order_count?.$extras.order_count? parseInt(order_count?.$extras.order_count):0,
      totalSpent: orderStat?.$extras.sum_price? parseFloat(orderStat?.$extras.sum_price):0,
      lastVisit: "2025-04-04T11:20:00Z",
    }
    user.stats = stat
    console.log(stat,orderStat?.$extras);
    
    rev('ok');
    }));

    await Promise.allSettled(promises);
    }

    return response.ok({ list, meta: productsPaginate.getMeta() })
  }

}