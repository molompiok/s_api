import Visite  from '#models/visite'
import type { HttpContext } from '@adonisjs/core/http'

import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { v4 } from 'uuid';

export default class VisitesController {
  /**
   * Ajouter une visite
   */
    public async visite({ auth, session }: HttpContext) {
      let user_id = ''
      let is_authenticate = false
  
      // 🔐 Authentification ou fallback session
      try {
        const user = await auth.authenticate()
        user_id = user.id
        is_authenticate = true
      } catch {
        const visite_id = session.get('visite_id')
        if (visite_id) {
          user_id = visite_id
        } else {
          const user_session = v4()
          session.put('visite_id', user_session)
          user_id = user_session
        }
      }
  
      // ⏱️ Vérifie la dernière visite de ce user
      const lastVisite = await Visite.query()
        .where('user_id', user_id)
        .orderBy('created_at', 'desc')
        .first()
  
      const now = DateTime.now()
  
      if (lastVisite && lastVisite.created_at.diff(now, 'hours').hours > -1) {
        // Moins d'une heure depuis la dernière visite
        return {
          message: 'Dernière visite il y a moins d’une heure, rien à faire.',
          lastVisit: lastVisite.created_at,
        }
      }
  
      // ✅ Crée une nouvelle visite
      const visite = await Visite.create({
        user_id,
        is_authenticate,
        created_at: now,
      })
  
      return {
        message: 'Nouvelle visite enregistrée.',
        visite,
      }
    }

  /**
   * Supprimer les visites de + de 1 mois (hors résumé mensuel)
   */
  public async cleanup() {
    const oneMonthAgo = DateTime.now().minus({ months: 1 })

    await Visite.query()
      .where('created_at', '<', oneMonthAgo.toSQL())
      .andWhere('is_month', false)
      .delete()
  }

  /**
   * Créer les résumés mensuels
   */
  public async summarize() {
    const now = DateTime.now()
    const lastMonthStart = now.minus({ months: 1 }).startOf('month')
    const lastMonthEnd = now.minus({ months: 1 }).endOf('month')

    const visites = await db
      .from('visites')
      .whereBetween('created_at', [lastMonthStart.toSQL(), lastMonthEnd.toSQL()])
      .andWhere('is_month', false)
      .select('user_id')
      .groupBy('user_id')

      console.log({visites});
      
    for (const visite of visites) {
      await Visite.create({
        user_id: visite.user_id,
        created_at: lastMonthStart,
      })
    }
  }

  /**
   * Récupérer les visites par période
   * ?period=3d | 7d | 1m | 1y | all
   * ?user_id=xxx (optionnel)
   */
  public async get_visites({ request }:HttpContext) {
    const {period ='1m',user_id}= request.qs()
    const now = DateTime.now()

    let from: DateTime
    let groupBy: 'day' | 'month'

    switch (period) {
      case '3d':
        from = now.minus({ days: 3 })
        groupBy = 'day'
        break
      case '7d':
        from = now.minus({ days: 7 })
        groupBy = 'day'
        break
      case '1m':
        from = now.minus({ months: 1 })
        groupBy = 'day'
        break
      case '1y':
        from = now.minus({ years: 1 })
        groupBy = 'month'
        break
      default:
        from = DateTime.fromMillis(0) // depuis le début
        groupBy = 'month'
    }

    const query = db
      .from('visites')
      .where('created_at', '>=', from.toSQL()!)

    if (user_id) {
      query.andWhere('user_id', user_id)//user_id
    }

    return await query
      .select(db.raw(`DATE_TRUNC('${groupBy}', created_at) as period`))
      .count('* as count')
      .groupBy('period')
      .orderBy('period', 'asc')
  }
}
