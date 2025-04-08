import Visite from '#models/visite'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

interface VisitStatsParams {
  period: 'day' | 'week' | 'month'
  startDate?: string
  userId?: string
  ipAddress?: string
  include?: {
    browser?: boolean
    os?: boolean
    device?: boolean
    pageUrl?: boolean
    referrer?: boolean
  }
}

interface VisitStatsResult {
  date: string
  visits: number
  users_count?: number
  [key: string]: number | string | undefined
}

export default class VisitStatsService {
  public static async getVisitStats(params: VisitStatsParams) {
    const { period, include = {} } = params
    console.log({ period, include })

    const groupFormat = getGroupFormat(period)
    const { clause: whereClause, bindings } = buildWhereClause(params)

    // Requête principale pour les statistiques de base
    const mainStatsSQL = `
      SELECT 
        ${groupFormat} AS date,
        COUNT(*) AS visits,
        COUNT(DISTINCT user_id) AS users_count
      FROM visites
      ${whereClause}
      GROUP BY ${groupFormat}
      ORDER BY ${groupFormat}
    `
    const mainStats = await db.rawQuery(mainStatsSQL, bindings)

    // Initialisation des maps pour chaque champ inclus
    let browserMap : any = {}
    let osMap : any = {}
    let deviceMap : any = {}
    let pageUrlMap : any = {}
    let referrerMap : any = {}

    // Statistiques par navigateur
    if (include.browser) {
      const browserStatsSQL = generateStatSQL(groupFormat, 'browser_name', whereClause)
      const browserStats = await db.rawQuery(browserStatsSQL, bindings)
      browserMap = buildFieldStatsMap(browserStats.rows, 'browser_name')
    }

    // Statistiques par système d'exploitation
    if (include.os) {
      const osStatsSQL = generateStatSQL(groupFormat, 'os_name', whereClause)
      const osStats = await db.rawQuery(osStatsSQL, bindings)
      osMap = buildFieldStatsMap(osStats.rows, 'os_name')
    }

    // Statistiques par type d'appareil
    if (include.device) {
      const deviceStatsSQL = generateStatSQL(groupFormat, 'device_type', whereClause)
      const deviceStats = await db.rawQuery(deviceStatsSQL, bindings)
      deviceMap = buildFieldStatsMap(deviceStats.rows, 'device_type')
    }

    // Statistiques par URL de page
    if (include.pageUrl) {
      const pageUrlStatsSQL = generateStatSQL(groupFormat, 'page_url', whereClause)
      const pageUrlStats = await db.rawQuery(pageUrlStatsSQL, bindings)
      pageUrlMap = buildFieldStatsMap(pageUrlStats.rows, 'page_url')
    }

    // Statistiques par référent
    if (include.referrer) {
      const referrerStatsSQL = generateStatSQL(groupFormat, 'referrer', whereClause)
      const referrerStats = await db.rawQuery(referrerStatsSQL, bindings)
      referrerMap = buildFieldStatsMap(referrerStats.rows, 'referrer')
    }

    // Construction du résultat final
    const final: VisitStatsResult[] = mainStats.rows.map((row: any) => {
      const res: VisitStatsResult = {
        date: row.date,
        visits: Number(row.visits),
        users_count: Number(row.users_count),
      }

      // Ajout des statistiques par navigateur
      if (include.browser && browserMap[row.date]) {
        res.browser = browserMap[row.date];
      }

      // Ajout des statistiques par OS
      if (include.os && osMap[row.date]) {
        res.os = osMap[row.date];
      }

      // Ajout des statistiques par appareil
      if (include.device && deviceMap[row.date]) {
        res.device = deviceMap[row.date];
      }

      // Ajout des statistiques par URL de page
      if (include.pageUrl && pageUrlMap[row.date]) {
        res.pageUrl = pageUrlMap[row.date];
      }

      // Ajout des statistiques par référent
      if (include.referrer && referrerMap[row.date]) {
        res.referrer = referrerMap[row.date];
      }

      return res
    })

    return final
  }
}

// Fonctions utilitaires (inchangées)
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
    FROM visites
    ${whereClause}
    GROUP BY ${groupFormat}, ${field}
    ORDER BY ${groupFormat}
  `
}

function buildWhereClause(params: VisitStatsParams): { clause: string, bindings: any[] } {
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
  if (params.ipAddress) {
    filters.push(`ip_address = ?`)
    bindings.push(params.ipAddress)
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