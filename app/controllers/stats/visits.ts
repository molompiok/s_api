// app/Services/VisitStatsService.ts
import Visite from '#models/visite'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db';

export { getVisitStats }

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

async function getVisitStats(params: VisitStatsParams): Promise<VisitStatsResult[]> {
    const { period, startDate, userId, ipAddress, include = {} } = params

    // Date de début par défaut : aujourd'hui
    const baseDate = startDate ? DateTime.fromISO(startDate) : DateTime.now()
    if (!baseDate.isValid) throw new Error('Invalid start date')

    // Construction de la requête de base
    let query = Visite.query()

    // Filtres userId ou ipAddress
    if (userId) query.where('user_id', userId)
    if (ipAddress) query.where('ip_address', ipAddress)

    // Définir la période de regroupement
    let groupByClause: string
    let dateFormat: string
    let timeRange: { start: DateTime; end: DateTime }

    switch (period) {
      case 'day':
        groupByClause = "strftime('%Y-%m-%d %H', created_at)" // Groupement par heure
        dateFormat = '%Y-%m-%d %H' // Format "2025-04-08 14"
        timeRange = {
          start: baseDate.startOf('day'),
          end: baseDate.endOf('day'),
        }
        break
      case 'week':
        groupByClause = "strftime('%Y-%m-%d', created_at)" // Groupement par jour
        dateFormat = '%Y-%m-%d' // Format "2025-04-08"
        timeRange = {
          start: baseDate.startOf('week'),
          end: baseDate.endOf('week'),
        }
        break
      case 'month':
        groupByClause = "strftime('%Y-W%W', created_at)" // Groupement par semaine (ISO)
        dateFormat = '%Y-W%W' // Format "2025-W15"
        timeRange = {
          start: baseDate.startOf('month'),
          end: baseDate.endOf('month'),
        }
        break
      default:
        throw new Error('Invalid period. Use "day", "week", or "month"')
    }

    // Filtrer par période (conversion explicite en string)
    const startStr = timeRange.start.toISO() as string
    const endStr = timeRange.end.toISO() as string
    query.whereBetween('created_at', [startStr, endStr])

    // Requête principale : nombre de visites et utilisateurs uniques
    let statsQuery = query
      .select(db.raw(`strftime('${dateFormat}', created_at) as date`)) // Raw query via db
      .count('* as visits') // Nombre total de visites
      .groupByRaw(groupByClause) // Groupement brut
      .orderBy('date', 'asc')

    if (!userId && !ipAddress) {
      statsQuery.select(db.raw('COUNT(DISTINCT user_id) as unique_users'))
    }

    // Ajouter les stats dynamiques selon les paramètres "include"
    const dynamicFields: { [key: string]: string[] } = {
      browser: [],
      os: [],
      device: [],
      pageUrl: [],
      referrer: [],
    }

    if (include.browser || include.os || include.device || include.pageUrl || include.referrer) {
      const distinctQuery = Visite.query()
      if (userId) distinctQuery.where('user_id', userId)
      if (ipAddress) distinctQuery.where('ip_address', ipAddress)

      // Remplacement de pluck par select + extraction manuelle
      if (include.browser) {
        const browsers = await distinctQuery.select('browser_name').distinct('browser_name')
        dynamicFields.browser = browsers.map((b) => b.browser_name).filter(Boolean)
      }
      if (include.os) {
        const oses = await distinctQuery.select('os_name').distinct('os_name')
        dynamicFields.os = oses.map((o) => o.os_name).filter(Boolean)
      }
      if (include.device) {
        const devices = await distinctQuery.select('device_type').distinct('device_type')
        dynamicFields.device = devices.map((d) => d.device_type).filter(Boolean)
      }
      if (include.pageUrl) {
        const pages = await distinctQuery.select('landing_page').distinct('landing_page')
        dynamicFields.pageUrl = pages.map((p) => p.landing_page).filter(Boolean)
      }
      if (include.referrer) {
        const referrers = await distinctQuery.select('referrer').distinct('referrer')
        dynamicFields.referrer = referrers.map((r) => r.referrer||'').filter(Boolean)
      }

      // Ajouter les colonnes dynamiques à la requête principale
      for (const [field, values] of Object.entries(dynamicFields)) {
        if (include[field as keyof typeof include] && values.length > 0) {
          values.forEach((value) => {
            const safeKey = `${field}_${value.replace(/[^a-zA-Z0-9]/g, '_')}`
            statsQuery.select(
              db.raw(`SUM(CASE WHEN ${field} = '${value}' THEN 1 ELSE 0 END) as "${safeKey}"`)
            )
          })
        }
      }
    }

    // Exécuter la requête
    const results = await statsQuery

    // Retourner les résultats typés
    return results.map((result) => ({
      date: (result as any).date,
      visits: (result as any).visits,
      ...((result as any).unique_users !== undefined && { uniqueUsers: (result as any).unique_users }),
      ...Object.fromEntries(
        Object.entries(result.$extras).filter(([key]) => key !== 'visits' && key !== 'unique_users')
      ),
    })) as VisitStatsResult[]
  }
