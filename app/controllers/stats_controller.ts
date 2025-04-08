import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import UserOrderItem from '#models/user_order_item'
import Visite from '#models/visite'

import UserOrder from '#models/user_order'
import { getVisitStats } from './stats/visits.js'
import VisitStatsService from './stats/visites2.js'




// Exemple d'utilisation :
/*
await getStatusDistributionByPeriod('7d')
// Résultat possible :
{
  '2025-04-01': { pending: 2, confirmed: 1, delivered: 0 },
  '2025-04-02': { pending: 1, confirmed: 2, delivered: 1 },
  ...
}

await getStatusDistributionByPeriod('1y')
// Résultat possible :
{
  '2025-01': { pending: 15, confirmed: 10, delivered: 8 },
  '2025-02': { pending: 12, confirmed: 15, delivered: 10 },
  ...
}
*/

// app/controllers/statistics_controller.ts

interface StatsParams {
  product_id?: string
  user_id?: string
  period?: '3d' | '7d' | '1m' | '1y' | 'all'
}

interface StatsResponse {
  visits_stats?: any
  order_stats?: any
  total_price_stats?: any
  total_items_stats?: any
  payment_pending_stats?: any
  status_distribution?: any
  [key: string]: any
}

export default class StatisticsController {
  
  private getDateRange(period?: string | undefined) {
    const end = DateTime.now()
    let start: DateTime

    switch (period) {
      case '3d':
        start = end.minus({ days: 3 })
        break
      case '7d':
        start = end.minus({ days: 7 })
        break
      case '1m':
        start = end.minus({ months: 1 })
        break
      case '1y':
        start = end.minus({ years: 1 })
        break
      case 'all':
      default:
        start = DateTime.fromJSDate(new Date(0)) // Beginning of time
        break
    }

    return { 
      start: start.toISO()||'2025-01-01',
      end: end.toISO()||(new Date()).toISOString()}
  }

  private async getVisitsStats(params: StatsParams) {
    const { start, end } = this.getDateRange(params.period)
    let query = Visite.query()
      .select('*')
      .whereBetween('created_at', [start, end])

    if (params.user_id) {
      query = query.where('user_id', params.user_id)
    }

    const visits = await query
     
    return visits.map(v => v)
  }

  private async getOrderStats(params: StatsParams) {
    const { start, end } = this.getDateRange(params.period)
    let query = UserOrder.query()
      .select('created_at')
      .whereBetween('created_at', [start, end])

    if (params.user_id) {
      query = query.where('user_id', params.user_id)
    }
    if (params.product_id) {
      query = query
        .preload('items', (itemsQuery) => {
          itemsQuery.where('product_id', params.product_id!)
        })
        .whereHas('items', (builder) => {
          builder.where('product_id', params.product_id!)
        })
    }

    const orders = await query
      .groupBy('created_at')
      .orderBy('created_at', 'asc')
      .count('* as orders')

    return orders.map(o => ({
      date: o.created_at.toISODate(),
      orders: Number(o.$extras.orders)
    }))
  }

  private async getTotalPriceStats(params: StatsParams) {
    const { start, end } = this.getDateRange(params.period)
    let query = UserOrder.query()
      .whereBetween('created_at', [start, end])

    if (params.user_id) {
      query = query.where('user_id', params.user_id)
    }
    if (params.product_id) {
      query = query
        .preload('items', (itemsQuery) => {
          itemsQuery.where('product_id', params.product_id!)
        })
        .whereHas('items', (builder) => {
          builder.where('product_id', params.product_id!)
        })
    }

    const result = await query
      .groupBy('created_at')
      .orderBy('created_at', 'asc')
      .sum('total_price as total')
      .select('created_at')

    return result.map(r => ({
      date: r.created_at.toISODate(),
      total_price: Number(r.$extras.total)
    }))
  }

  private async getTotalItemsStats(params: StatsParams) {
    const { start, end } = this.getDateRange(params.period)
    let query = UserOrderItem.query()
      .whereBetween('created_at', [start, end])

    if (params.user_id) {
      query = query.where('user_id', params.user_id)
    }
    if (params.product_id) {
      query = query.where('product_id', params.product_id)
    }

    const result = await query
      .groupBy('created_at')
      .orderBy('created_at', 'asc')
      .sum('quantity as total')
      .select('created_at')

    return result.map(r => ({
      date: r.created_at.toISODate(),
      total_items: Number(r.$extras.total)
    }))
  }

  private async getPaymentPendingStats(params: StatsParams) {
    const { start, end } = this.getDateRange(params.period)
    let query = UserOrder.query()
      .where('payment_status', 'pending')
      .whereBetween('created_at', [start, end])

    if (params.user_id) {
      query = query.where('user_id', params.user_id)
    }
    if (params.product_id) {
      query = query
        .preload('items', (itemsQuery) => {
          itemsQuery.where('product_id', params.product_id!)
        })
        .whereHas('items', (builder) => {
          builder.where('product_id', params.product_id!)
        })
    }

    const result = await query
      .groupBy('created_at')
      .orderBy('created_at', 'asc')
      .count('* as pending')
      .sum('total_price as total_pending')
      .select('created_at')

    return result.map(r => ({
      date: r.created_at.toISODate(),
      pending_orders: Number(r.$extras.pending),
      total_pending_amount: Number(r.$extras.total_pending)
    }))
  }

  private async getStatusDistribution(params: StatsParams) {
    const { start, end } = this.getDateRange(params.period)
    let query = UserOrder.query()
      .whereBetween('created_at', [start, end])

    if (params.user_id) {
      query = query.where('user_id', params.user_id)
    }
    if (params.product_id) {
      query = query
        .preload('items', (itemsQuery) => {
          itemsQuery.where('product_id', params.product_id!)
        })
        .whereHas('items', (builder) => {
          builder.where('product_id', params.product_id!)
        })
    }

    const result = await query
      .groupBy('status')
      .count('* as count')
      .select('status')

    return result.reduce((acc, curr) => {
      acc[curr.status] = Number(curr.$extras.count)
      return acc
    }, {} as Record<string, number>)
  }
  private async getStatusDistributionByPeriod(period: '3d' | '7d' | '1m' | '1y' | 'all') {
    // Déterminer la plage de dates
    
    const { start, end } = this.getDateRange(period)
  
    // Choisir le regroupement (jour ou mois) selon la période
    const groupByFormat = period === '1y' || period === 'all' ? 'yyyy-MM' : 'yyyy-MM-dd'
  
    // Requête
    const result = await UserOrder.query()
      .whereBetween('created_at', [start, end])
      .select('status')
      // .select(UserOrder.query().whereRaw(`DATE_FORMAT(created_at, '${groupByFormat}') as period_date`))
      .groupBy('status')
      .count('* as count')
      // .orderBy('created_at','asc')
  
    // Transformer les résultats
    const distribution: Record<string, Record<string, number>> = {}
  
    result.forEach(row => {
      const date = (row as any).period_date
      const status = row.status
      const count = Number(row.$extras.count)
  
      if (!distribution[date]) {
        distribution[date] = {}
      }
      distribution[date][status] = count
    })
  
    return distribution
  }
  
  public async index({ request, response }: HttpContext) {
    const params: StatsParams = {
      product_id: request.input('product_id'),
      user_id: request.input('user_id'),
      period: request.input('period'),// par heure, par jour, par semaine, par mois
    }

    console.log(params);
    
    const statsToInclude = request.input('stats', []) as string[]

    // Default case: if no params and no specific stats requested
    const result: StatsResponse = {}
    // if (!params.product_id && !params.user_id && !statsToInclude.length) {
    //   result.visits_stats = await this.getVisitsStats(params)
    //   result.order_stats = await this.getOrderStats(params)
      
    //   return response.json(result)
    // }

    // Build response based on requested stats
    
    if (statsToInclude.includes('visits_stats') || !statsToInclude.length) {
      result.visits_stats = await VisitStatsService.getVisitStats({
        period:'month',
        userId:params.user_id,
        include:{
          device:true,
          os:true,
          // pageUrl:true,
          referrer:true,
          browser:true
        }
      })
        // result.visits_stats_grok = await getVisitStats({
      //   period:'week',
      //   include:{
      //     browser:true,
      //   },
      //   startDate:'2025-01-01',
      // })
      // result.visits_stats_gpt = await this.getVisitsStats({period:'all'})
    }
    // if (statsToInclude.includes('order_stats') || !statsToInclude.length) {
    //   result.order_stats = await this.getOrderStats(params)
    // }
    // if (statsToInclude.includes('total_price_stats') || !statsToInclude.length) {
    //   result.total_price_stats = await this.getTotalPriceStats(params)
    // }
    // if (statsToInclude.includes('total_items_stats') || !statsToInclude.length) {
    //   result.total_items_stats = await this.getTotalItemsStats(params)
    // }
    // if (statsToInclude.includes('payment_pending_stats') || !statsToInclude.length) {
    //   // result.payment_pending_stats = await this.getPaymentStats(params)
    // }
    // if (statsToInclude.includes('status_distribution') || !statsToInclude.length) {
    //   result.status_distribution = await this.getStatusDistribution(params)
    // }

    return response.json(result)
  }
}