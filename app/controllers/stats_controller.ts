import type { HttpContext } from '@adonisjs/core/http'

import { OrderStatsService } from '../services/OrderStatService.js'
import { VisitStatsService } from '../services/VisitStatService.js'

// app/controllers/statistics_controller.ts

interface StatsParams {
  product_id?: string
  user_id?: string
  period?: 'day' | 'week' | 'month'
  device: 'true'
  os: 'true'
  pageUrl: 'true'
  referrer: 'true'
  browser: 'true'
  status: 'true'
  payment_method: 'true'
  payment_status: 'true'
  with_delivery: 'true'
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

  public async index({ request, response }: HttpContext) {
    const params: StatsParams = {
      product_id: request.input('product_id'),
      user_id: request.input('user_id'),
      period: request.input('period'),
      device: request.input('device'),
      os: request.input('os'),
      pageUrl: request.input('page_url'),
      referrer: request.input('referrer'),
      browser: request.input('browser'),
      status: request.input('status'),
      payment_method: request.input('payment_method'),
      payment_status: request.input('payment_status'),
      with_delivery: request.input('with_delivery'),
    }

    // console.log(params);

    const statsToInclude = request.input('stats', []) as string[]

    // Default case: if no params and no specific stats requested
    const result: StatsResponse = {}
    // Build response based on requested stats

    if (statsToInclude.includes('visits_stats')) {
      result.visits_stats = await VisitStatsService.getVisitStats({
        period: params.period || 'month',
        userId: params.user_id,
        ipAddress: undefined,
        startDate: undefined,
        include: {
          device: params.device === 'true',
          os: params.os === 'true',
          pageUrl: params.pageUrl === 'true',
          referrer: params.referrer === 'true',
          browser: params.browser === 'true'
        }
      })
    }
    if (statsToInclude.includes('order_stats')) {
      result.order_stats = await OrderStatsService.getOrderStats({
        period: params.period || 'month',
        productId: params.product_id,
        startDate: undefined,
        userId: params.user_id,
        include: {
          status: params.status === 'true',
          payment_method: params.payment_method === 'true',
          payment_status: params.payment_status === 'true',
          with_delivery: params.with_delivery === 'true',
        }
      })
    }

    // console.log(result);

    return response.json(result)
  }
}