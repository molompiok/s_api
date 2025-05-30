// app/controllers/stats_controller.ts
import type { HttpContext } from '@adonisjs/core/http'
import { OrderStatsService } from '../services/OrderStatService.js' // Importer le service refactorisé
import { VisitStatsService } from '../services/VisitStatService.js' // Importer le service refactorisé
import vine from '@vinejs/vine'; // Importer Vine
import { Infer } from '@vinejs/vine/types';
import logger from '@adonisjs/core/services/logger';
import { TypeJsonRole } from '#models/role'; // Pour permissions
import { calculateDateRange } from '#services/StatsUtils';
import { securityService } from '#services/SecurityService';

// --- Permissions ---
const VIEW_STATS_PERMISSION: keyof TypeJsonRole = 'filter_command'; // Ou une permission dédiée 'view_statistics'

// --- Types et Enums locaux (pour la validation) ---
const VALID_STATS_PERIODS = ['day', 'week', 'month'] as const; // Exclure 'all' ici? Ou le gérer spécifiquement?
// type StatsPeriod = typeof VALID_STATS_PERIODS[number];

const VALID_STATS_INCLUDE_VISITS = ['browser', 'os', 'device', 'landing_page', 'referrer'] as const;
// type VisitIncludeKey = typeof VALID_STATS_INCLUDE_VISITS[number];

const VALID_STATS_INCLUDE_ORDERS = ['status', 'payment_status', 'payment_method', 'with_delivery'] as const;
// type OrderIncludeKey = typeof VALID_STATS_INCLUDE_ORDERS[number];

// --- Schémas de validation Vine ---

const baseSchema = {
  period: vine.enum(VALID_STATS_PERIODS).optional(), // Rendre optionnel si défaut dans le service
  start_at: vine.string().optional(), // Valider format ISO date/heure
  count: vine.number().positive().optional(),
  end_at: vine.string().optional(),
  user_id: vine.string().uuid().optional(),
  product_id: vine.string().uuid().optional(),
}

// Schéma spécifique pour les stats de visite
const visitStatsSchema = vine.compile(
  vine.object({
    ...baseSchema,
    include: vine.array(vine.enum(VALID_STATS_INCLUDE_VISITS)).optional()
  })
);

// Schéma spécifique pour les stats de commande
const orderStatsSchema = vine.compile(
  vine.object({
    ...baseSchema,
    include: vine.array(vine.enum(VALID_STATS_INCLUDE_ORDERS)).optional()
  })
);

// Schéma pour KPI (plus simple)
const kpiStatsSchema = vine.compile(
  vine.object({
    period: vine.enum(VALID_STATS_PERIODS).optional(),
    start_at: vine.string().optional(),
    end_at: vine.string().optional(),
    count: vine.number().positive().optional(),
  })
);


export default class StatisticsController {

  /**
   * Retourne les KPIs principaux pour une période donnée.
   * Endpoint: GET /stats/kpi
   */
  public async getKpi({ request, response, auth, i18n: { t } }: HttpContext) {
    // 🔐 Authentification & 🛡️ Autorisation
    await securityService.authenticate({ request, auth });
    try {
      await request.ctx?.bouncer.authorize('collaboratorAbility', [VIEW_STATS_PERMISSION]);
    } catch (error) {
      return response.forbidden({ message: t('unauthorized_action') });
    }

    let params: Infer<typeof kpiStatsSchema>;
    try {
      // ✅ Validation
      params = await kpiStatsSchema.validate(request.qs());
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        return response.badRequest({ message: t('validationFailed'), errors: error.messages });
      }
      throw error;
    }

    try {
      const { count, end_at, period = 'month', start_at } = params
      const range = calculateDateRange(period || 'month', start_at, count, end_at)

      const [visitData, orderData] = await Promise.all([
        VisitStatsService.getVisitStats({ period, ...range, include: {} }), // Pas besoin d'include détaillé
        OrderStatsService.getOrderStats({ period, ...range, include: {} })
      ]);

      // Calculer les KPIs agrégés
      const totalVisits = visitData.reduce((sum, item) => sum + item.visits, 0);
      const totalOrders = orderData.reduce((sum, item) => sum + item.orders_count, 0);
      const totalRevenue = orderData.reduce((sum, item) => sum + item.total_price, 0);
      const uniqueVisitors = visitData.reduce((sum, item) => sum + (item.users_count || 0), 0); // Approximation si groupé par mois/semaine
      const conversionRate = totalVisits > 0 ? parseFloat(((totalOrders / totalVisits) * 100).toFixed(2)) : 0;
      const averageOrderValue = totalOrders > 0 ? parseFloat((totalRevenue / totalOrders).toFixed(2)) : 0;

      const kpis = {
        visitData,
        orderData,
        totalRevenue,
        totalOrders,
        totalVisits,
        uniqueVisitors, // Nom à clarifier (visiteurs uniques sur la période totale)
        conversionRate,
        averageOrderValue,
      };

      return response.ok(kpis);

    } catch (error) {
      logger.error({ error, params }, "Failed to fetch KPI statistics");
      return response.internalServerError({ message: t('stats.fetchFailed'), error: error.message });
    }
  }

  /**
   * Retourne les statistiques de visites détaillées pour une période.
   * Endpoint: GET /stats/visits
   */
  public async getVisitDetails({ request, response, auth, i18n: { t } }: HttpContext) {
    // 🔐 Authentification & 🛡️ Autorisation

    await securityService.authenticate({ request, auth });
    try {
      await request.ctx?.bouncer.authorize('collaboratorAbility', [VIEW_STATS_PERMISSION]);
    } catch (error) {
      return response.forbidden({ message: t('unauthorized_action') });
    }

    let params: Infer<typeof visitStatsSchema>;
    try {
      // ✅ Validation
      params = await visitStatsSchema.validate(request.qs());
    } catch (error) {
      console.log(error);

      if (error.code === 'E_VALIDATION_ERROR') {
        return response.badRequest({ message: t('validationFailed'), errors: error.messages });
      }
      throw error;
    }

    console.log('getVisites', { params });


    try {
      // Préparer les options 'include' pour le service
      const includeOptions: any = {};
      if (params.include) {
        params.include.forEach(key => { includeOptions[key] = true; });
      } else {
        // Inclure tout par défaut si 'include' n'est pas spécifié? Ou rien? Incluons tout par défaut.
        VALID_STATS_INCLUDE_VISITS.forEach(key => includeOptions[key] = true);
      }
      const { count, end_at, period, start_at } = params
      const range = calculateDateRange(period || 'week', start_at, count, end_at)

      const visitStats = await VisitStatsService.getVisitStats({
        period: params.period || 'month',
        userId: params.user_id,
        ...range,
        ipAddress: undefined,
        include: includeOptions,
      })


      return response.ok(visitStats);

    } catch (error) {
      console.log(error);

      logger.error({ error, params }, "Failed to fetch detailed visit statistics");
      return response.internalServerError({ message: t('stats.fetchFailed'), error: error.message });
    }
  }

  /**
  * Retourne les statistiques de commandes détaillées pour une période.
  * Endpoint: GET /stats/orders
  */
  public async getOrderDetails({ request, response, auth, i18n: { t } }: HttpContext) {
    // 🔐 Authentification & 🛡️ Autorisation
    await securityService.authenticate({ request, auth });
    try {
      await request.ctx?.bouncer.authorize('collaboratorAbility', [VIEW_STATS_PERMISSION]);
    } catch (error) {
      return response.forbidden({ message: t('unauthorized_action') });
    }

    let params: Infer<typeof orderStatsSchema>;
    try {
      // ✅ Validation
      params = await orderStatsSchema.validate(request.qs());
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        return response.badRequest({ message: t('validationFailed'), errors: error.messages });
      }
      throw error;
    }

    console.log('getOrders', { params });


    try {
      const includeOptions: any = {};
      if (params.include) {
        params.include.forEach(key => { includeOptions[key] = true; });
      } else {
        // Inclure tout par défaut
        VALID_STATS_INCLUDE_ORDERS.forEach(key => includeOptions[key] = true);
      }

      const { count, end_at, period, start_at } = params
      const range = calculateDateRange(period || 'week', start_at, count, end_at)
      const orderStats = await OrderStatsService.getOrderStats({
        period: params.period || 'month',
        productId: params.product_id,
        ...range,
        userId: params.user_id,
        include: includeOptions,
      })
      return response.ok(orderStats);

    } catch (error) {
      logger.error({ error, params }, "Failed to fetch detailed order statistics");
      return response.internalServerError({ message: t('stats.fetchFailed'), error: error.message });
    }
  }
} // Fin StatisticsController