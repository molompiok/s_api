import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import UserOrderItem from '#models/user_order_item'
import Visite from '#models/visite'
import UserOrder from '#models/user_order'
// import { getVisitStats } from './stats/visits.js' // Supposons obsolète si VisitStatsService est utilisé
import VisitStatsService from './stats/visites2.js' // Conservé
import vine from '@vinejs/vine'; // ✅ Ajout de Vine
import { t } from '../utils/functions.js'; // ✅ Ajout de t
import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import logger from '@adonisjs/core/services/logger'; // Ajout pour logs
import { TypeJsonRole } from '#models/role'; // Pour type permissions
import db from '@adonisjs/lucid/services/db'

// Définir les périodes valides pour la validation
const VALID_PERIODS = ['3d', '7d', '1m', '1y', 'all'] as const;
type ValidPeriod = typeof VALID_PERIODS[number];

// Définir les types de stats valides pour la validation
const VALID_STATS_TYPES = [
    'visits_stats',
    'order_stats',
    'total_price_stats',
    'total_items_stats',
    'payment_pending_stats',
    'status_distribution'
    // 'status_distribution_by_period' // Si on ajoute cette stat
] as const;
type ValidStatType = typeof VALID_STATS_TYPES[number];

// Permissions requises (à ajuster selon la sensibilité des stats)
const VIEW_STATS_PERMISSION: keyof TypeJsonRole = 'filter_command'; // Exemple: utiliser une permission existante ou en créer une nouvelle

// Interface pour les paramètres parsés et validés
interface ValidatedStatsParams {
  product_id?: string
  user_id?: string
  period?: ValidPeriod
  stats?: ValidStatType[]
}

// Interface pour la réponse (gardée pour clarté)
interface StatsResponse {
  visits_stats?: any
  order_stats?: any
  total_price_stats?: any
  total_items_stats?: any
  payment_pending_stats?: any
  status_distribution?: any
  // status_distribution_by_period?: any
  [key: string]: any
}

export default class StatisticsController {

    // --- Schéma de validation Vine ---
    private getStatsSchema = vine.compile(
        vine.object({
            product_id: vine.string().uuid().optional(),
            user_id: vine.string().uuid().optional(),
            period: vine.enum(VALID_PERIODS).optional(),
            stats: vine.array(vine.enum(VALID_STATS_TYPES)).optional(),
        })
    );

    // --- Méthodes privées (calcul des stats) ---

    // Inchangé - calcule la plage de dates
    private getDateRange(period?: ValidPeriod) {
        const end = DateTime.now();
        let start: DateTime;

        switch (period) {
            case '3d': start = end.minus({ days: 3 }); break;
            case '7d': start = end.minus({ days: 7 }); break;
            case '1m': start = end.minus({ months: 1 }); break;
            case '1y': start = end.minus({ years: 1 }); break;
            case 'all':
            default: start = DateTime.fromMillis(0); break; // Utiliser fromMillis(0)
        }
        // Retourner des objets DateTime pour flexibilité
        return { start, end };
    }

    // Remplacé par l'appel à VisitStatsService dans la méthode index
    // private async getVisitsStats(params: ValidatedStatsParams) { ... }

    // Les méthodes suivantes calculent des stats spécifiques.
    // Elles utilisent maintenant ValidatedStatsParams et retournent des promesses.
    private async getOrderStats(params: ValidatedStatsParams): Promise<any> {
        const { start, end } = this.getDateRange(params.period);
        let query = UserOrder.query()
            .select(db.raw("DATE(created_at) as stat_date")) // Regrouper par jour
            .whereBetween('created_at', [start.toISO()||'', end.toISO()||''])
            .groupBy('stat_date')
            .orderBy('stat_date', 'asc')
            .count('* as orders_count'); // Utiliser count distinct ?

        if (params.user_id) {
            query = query.where('user_id', params.user_id);
        }
        if (params.product_id) {
            query = query.whereHas('items', (builder) => {
                builder.where('product_id', params.product_id!);
            });
        }

        const orders = await query;
        return orders.map(o => ({
            date: o.$extras.stat_date, // Garder la date du groupement
            orders: Number(o.$extras.orders_count)
        }));
    }

    private async getTotalPriceStats(params: ValidatedStatsParams): Promise<any> {
        const { start, end } = this.getDateRange(params.period);
        let query = UserOrder.query()
            .select(db.raw("DATE(created_at) as stat_date")) // Regrouper par jour
            .whereBetween('created_at', [start.toISO()||'', end.toISO()||''])
            .groupBy('stat_date')
            .orderBy('stat_date', 'asc')
            .sum('total_price as total');

        if (params.user_id) {
            query = query.where('user_id', params.user_id);
        }
         if (params.product_id) {
            query = query.whereHas('items', (builder) => {
                builder.where('product_id', params.product_id!);
            });
        }

        const result = await query;
        return result.map(r => ({
            date: r.$extras.stat_date,
            total_price: Number(r.$extras.total) || 0 // Assurer 0 si null
        }));
    }

    private async getTotalItemsStats(params: ValidatedStatsParams): Promise<any> {
         const { start, end } = this.getDateRange(params.period);
        // Calculer sur UserOrderItem est plus précis que sur UserOrder.items_count
        let query = UserOrderItem.query()
             .select(db.raw("DATE(created_at) as stat_date"))
             .whereBetween('created_at', [start.toISO()||'', end.toISO()||''])
             .groupBy('stat_date')
             .orderBy('stat_date', 'asc')
             .sum('quantity as total_items_sum'); // Utiliser sum(quantity)

        if (params.user_id) {
             query = query.where('user_id', params.user_id);
        }
        if (params.product_id) {
             query = query.where('product_id', params.product_id);
        }

        const result = await query;
        return result.map(r => ({
             date: r.$extras.stat_date,
             total_items: Number(r.$extras.total_items_sum) || 0
        }));
    }

    private async getPaymentPendingStats(params: ValidatedStatsParams): Promise<any> {
        const { start, end } = this.getDateRange(params.period);
        let query = UserOrder.query()
            .select(db.raw("DATE(created_at) as stat_date"))
            .where('payment_status', 'pending') // Statut exact
            .whereBetween('created_at', [start.toISO()||'', end.toISO()||''])
            .groupBy('stat_date')
            .orderBy('stat_date', 'asc')
            .count('* as pending_orders_count')
            .sum('total_price as total_pending_amount');

        if (params.user_id) {
            query = query.where('user_id', params.user_id);
        }
         if (params.product_id) {
            query = query.whereHas('items', (builder) => {
                builder.where('product_id', params.product_id!);
            });
        }

        const result = await query;
        return result.map(r => ({
            date: r.$extras.stat_date,
            pending_orders: Number(r.$extras.pending_orders_count) || 0,
            total_pending_amount: Number(r.$extras.total_pending_amount) || 0
        }));
    }

    // Calcul de la distribution globale des statuts sur la période
    private async getStatusDistribution(params: ValidatedStatsParams): Promise<Record<string, number>> {
        const { start, end } = this.getDateRange(params.period);
        let query = UserOrder.query()
            .whereBetween('created_at', [start.toISO()||'', end.toISO()||''])
            .groupBy('status')
            .count('* as count')
            .select('status');

        if (params.user_id) {
            query = query.where('user_id', params.user_id);
        }
        if (params.product_id) {
            query = query.whereHas('items', (builder) => {
                builder.where('product_id', params.product_id!);
            });
        }

        const result = await query;
        return result.reduce((acc, curr) => {
            acc[curr.status] = Number(curr.$extras.count) || 0;
            return acc;
        }, {} as Record<string, number>);
    }

    // Note: getStatusDistributionByPeriod n'est pas utilisé dans index() actuellement
    // et nécessiterait une adaptation pour fonctionner correctement avec différents SGBD
    // (DATE_FORMAT est spécifique à MySQL). Utiliser db.raw avec la fonction de date appropriée.
    // private async getStatusDistributionByPeriod(period: ValidPeriod) { ... }

    // --- Méthode publique du contrôleur ---
    public async index({ request, response, auth, bouncer }: HttpContext) {
         // 🔐 Authentification
        await auth.authenticate();
         // 🛡️ Permissions
         try {
             await bouncer.authorize('collaboratorAbility', [VIEW_STATS_PERMISSION]);
         } catch (error) {
             if (error.code === 'E_AUTHORIZATION_FAILURE') {
                  // 🌍 i18n
                 return response.forbidden({ message: t('unauthorized_action') });
             }
             throw error;
         }

        let payload: Infer<typeof this.getStatsSchema>;
        try {
            // ✅ Validation Vine pour Query Params
            payload = await this.getStatsSchema.validate(request.qs());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                 // 🌍 i18n
                return response.badRequest({ message: t('validationFailed'), errors: error.messages });
            }
            throw error;
        }

        // Utiliser les paramètres validés
        const params: ValidatedStatsParams = {
            product_id: payload.product_id,
            user_id: payload.user_id,
            period: payload.period || '1m', // Défaut à '1m' si non fourni
            stats: payload.stats // Types de stats demandés (peut être undefined)
        };

        const statsToInclude = params.stats || VALID_STATS_TYPES; // Inclure tout si non spécifié

        const result: StatsResponse = {};
        const promises: Promise<any>[] = [];
        const statKeys: (keyof StatsResponse)[] = [];


        // Construire dynamiquement les promesses pour les stats demandées
        if (statsToInclude.includes('visits_stats')) {
            statKeys.push('visits_stats');
             // Utiliser VisitStatsService directement
             promises.push(VisitStatsService.getVisitStats({
                 period: 'month', // Adapter si besoin
                 userId: params.user_id,
                 include: { device: true, os: true, referrer: true, browser: true }
             }));
        }
        if (statsToInclude.includes('order_stats')) {
            statKeys.push('order_stats');
            promises.push(this.getOrderStats(params));
        }
        if (statsToInclude.includes('total_price_stats')) {
            statKeys.push('total_price_stats');
            promises.push(this.getTotalPriceStats(params));
        }
        if (statsToInclude.includes('total_items_stats')) {
            statKeys.push('total_items_stats');
            promises.push(this.getTotalItemsStats(params));
        }
        if (statsToInclude.includes('payment_pending_stats')) {
            statKeys.push('payment_pending_stats');
            promises.push(this.getPaymentPendingStats(params));
        }
        if (statsToInclude.includes('status_distribution')) {
            statKeys.push('status_distribution');
            promises.push(this.getStatusDistribution(params));
        }
        // Ajouter d'autres stats ici si nécessaire

        try {
            // Exécuter toutes les requêtes de stats en parallèle
            const results = await Promise.all(promises);

            // Assigner les résultats aux bonnes clés dans l'objet de réponse
            results.forEach((statResult, index) => {
                const key = statKeys[index];
                if (key) {
                    result[key] = statResult;
                }
            });

            // Pas de message i18n car on retourne les données
            return response.ok(result);

        } catch (error) {
            logger.error({ userId: auth.user!.id, params: params, error: error.message, stack: error.stack }, 'Failed to fetch statistics');
             // 🌍 i18n
             return response.internalServerError({ message: t('stats.fetchFailed'), error: error.message }); // Nouvelle clé
        }
    }
}