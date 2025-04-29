import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

interface OrderStatsParams {
  period: 'day' | 'week' | 'month'
  startDate?: string
  userId?: string
  productId?: string
  include?: {
    status?: boolean
    payment_status?: boolean
    payment_method?: boolean
    with_delivery?: boolean
  }
}

interface OrderStatsResult {
  date: string
  users_count: number
  orders_count: number
  total_price: number
  items_count: number
  return_delivery_price: number
  [key: string]: number | string | undefined
}

export  class OrderStatsService {
  public static async getOrderStats(params: OrderStatsParams) {
    const { period, include = {} } = params
    // console.log({ period, include })

    const groupFormat = getGroupFormat(period)
    const { clause: whereClause, bindings } = buildWhereClause(params)

    // Requête principale pour les statistiques de base
    const mainStatsSQL = `
      SELECT 
        ${groupFormat} AS date,
        COUNT(DISTINCT user_id) AS users_count,
        COUNT(*) AS orders_count,
        SUM(total_price) AS total_price,
        SUM(items_count) AS items_count,
        SUM(return_delivery_price) AS return_delivery_price
      FROM user_orders
      ${whereClause}
      GROUP BY ${groupFormat}
      ORDER BY ${groupFormat}
    `
    const mainStats = await db.rawQuery(mainStatsSQL, bindings)

    // Initialisation des maps pour chaque champ inclus
    let statusMap : any = {}
    let paymentStatusMap : any = {}
    let paymentMethodMap : any = {}
    let withDeliveryMap : any = {}

    // Statistiques par statut
    if (include.status) {
      const statusStatsSQL = generateStatSQL(groupFormat, 'status', whereClause)
      const statusStats = await db.rawQuery(statusStatsSQL, bindings)
      statusMap = buildFieldStatsMap(statusStats.rows, 'status')
    }

    // Statistiques par statut de paiement
    if (include.payment_status) {
      const paymentStatusSQL = generateStatSQL(groupFormat, 'payment_status', whereClause)
      const paymentStatusStats = await db.rawQuery(paymentStatusSQL, bindings)
      paymentStatusMap = buildFieldStatsMap(paymentStatusStats.rows, 'payment_status')
    }

    // Statistiques par méthode de paiement
    if (include.payment_method) {
      const paymentMethodSQL = generateStatSQL(groupFormat, 'payment_method', whereClause)
      const paymentMethodStats = await db.rawQuery(paymentMethodSQL, bindings)
      paymentMethodMap = buildFieldStatsMap(paymentMethodStats.rows, 'payment_method')
    }

    // Statistiques par livraison
    if (include.with_delivery) {
      const withDeliverySQL = generateStatSQL(groupFormat, 'with_delivery', whereClause)
      const withDeliveryStats = await db.rawQuery(withDeliverySQL, bindings)
      withDeliveryMap = buildFieldStatsMap(withDeliveryStats.rows, 'with_delivery')
    }

    // Construction du résultat final
    const final: OrderStatsResult[] = mainStats.rows.map((row: any) => {
      const res: OrderStatsResult = {
        date: row.date,
        users_count: Number(row.users_count),
        orders_count: Number(row.orders_count),
        total_price: Number(row.total_price || 0),
        items_count: Number(row.items_count || 0),
        return_delivery_price: Number(row.return_delivery_price || 0),
      }

      // Ajout des statistiques par statut
      if (include.status && statusMap[row.date]) {
        res.status = statusMap[row.date];
      }

      // Ajout des statistiques par statut de paiement
      if (include.payment_status && paymentStatusMap[row.date]) {
        res.payment_status = paymentStatusMap[row.date];
      }

      // Ajout des statistiques par méthode de paiement
      if (include.payment_method && paymentMethodMap[row.date]) {
        res.payment_method = paymentMethodMap[row.date];
      }

      // Ajout des statistiques par livraison
      if (include.with_delivery && withDeliveryMap[row.date]) {
        res.with_delivery = withDeliveryMap[row.date];
      }

      return res
    })

    return final
  }
}

// Fonctions utilitaires (identiques à VisitStatsService)
function buildFieldStatsMap(rows: any[], field: string): Record<string, Record<string, number>> {
  const map: Record<string, Record<string, number>> = {}

  for (const row of rows) {
    const key = row[field]
    if (!key) continue
    if (!map[row.date]) {
      map[row.date] = {}
    }
    map[row.date][key] = Number(row.count)
  }

  return map
}

function generateStatSQL(groupFormat: string, field: string, whereClause: string): string {
  return `
    SELECT 
      ${groupFormat} AS date,
      ${field},
      COUNT(*) AS count
    FROM user_orders
    ${whereClause}
    GROUP BY ${groupFormat}, ${field}
    ORDER BY ${groupFormat}
  `
}

function buildWhereClause(params: OrderStatsParams): { clause: string, bindings: any[] } {
  const filters = []
  const bindings: any[] = []

  if (params.startDate) {
    filters.push(`created_at >= ?`)
    bindings.push(DateTime.fromISO(params.startDate).toSQL())
  }
  if (params.userId) {
    filters.push(`user_id = ?`)
    bindings.push(params.userId)
  }
  if (params.productId) {
    filters.push(`EXISTS (SELECT 1 FROM user_order_items WHERE user_order_items.order_id = user_orders.id AND user_order_items.product_id = ?)`)
    bindings.push(params.productId)
  }

  const clause = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  return { clause, bindings }
}

function getGroupFormat(period: 'day' | 'week' | 'month'): string {
  switch (period) {
    case 'day':
      return "to_char(created_at, 'YYYY-MM-DD HH24')"
    case 'week':
      return "to_char(created_at, 'YYYY-MM-DD')"
    case 'month':
      return "to_char(created_at, 'IYYY-IW')"
    default:
      throw new Error('Invalid period')
  }
}