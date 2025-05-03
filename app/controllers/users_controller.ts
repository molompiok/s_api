import User from '#models/user' // Ajout RoleType
import type { HttpContext } from '@adonisjs/core/http'
// import db from '@adonisjs/lucid/services/db' // Préférer Lucid ORM
import { applyOrderBy } from './Utils/query.js' // Gardé tel quel
import Comment from '#models/comment'
import UserOrder from '#models/user_order'
import Visite from '#models/visite' // Importer Visite pour lastVisit
import vine from '@vinejs/vine'; // ✅ Ajout de Vine
import { t } from '../utils/functions.js'; // ✅ Ajout de t
import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import logger from '@adonisjs/core/services/logger'; // Ajout pour logs
import { TypeJsonRole } from '#models/role' // Pour type permissions
import { DateTime } from 'luxon'

// Permissions
const VIEW_USERS_PERMISSION: keyof TypeJsonRole = 'filter_client'; // Utiliser la permission existante



export default class UsersController {

    // --- Schéma de validation Vine ---
    private getUsersSchema = vine.compile(
        vine.object({
            user_id: vine.string().uuid().optional(),
            name: vine.string().trim().optional(),
            order_by: vine.string().trim().optional(),
            page: vine.number().positive().optional(),
            limit: vine.number().positive().optional(),
            with_client_role: vine.boolean().optional(),
            with_client_stats: vine.boolean().optional(),
            with_addresses: vine.boolean().optional(),
            with_phones: vine.boolean().optional(),
        })
    );

    // --- Méthode du contrôleur ---

    async get_users({ request, response, auth, bouncer }: HttpContext) {
        

        
        // 🔐 Authentification
        await auth.authenticate();
        // 🛡️ Permissions (pour voir la liste des utilisateurs)
        try {
            await bouncer.authorize('collaboratorAbility', [VIEW_USERS_PERMISSION]);
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') });
            }
            throw error;
        }

        let payload: Infer<typeof this.getUsersSchema>;
        try {
            // ✅ Validation Vine pour Query Params
            payload = await this.getUsersSchema.validate(request.qs());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: t('validationFailed'), errors: error.messages });
            }
            throw error;
        }

        console.log(payload);
        try {
            // --- Logique métier ---
            const pageNum = payload.page ?? 1;
            const limitNum = payload.limit ?? 10;

            // Utiliser Lucid ORM pour User
            let query = User.query().select('*'); // Sélectionner toutes les colonnes par défaut

            if(payload.with_phones){
                query.preload('user_phones')
            }
            if(payload.with_addresses){
                query.preload('user_addresses')
            }
            // if(payload.whith_phones){
            //     query.preload('user_phones')
            // }
            // 🔍 GET par ID
            if (payload.user_id) {
                query.where('id', payload.user_id).limit(1) // Utiliser .first()
            }

            // Appliquer les filtres si pas de user_id
            if (payload.name) {
                const searchTerm = `%${payload.name.toLowerCase().split(' ').join('%')}%`;
                query.where((q) => {
                    // Recherche sur nom et email (plus utile)
                    q.whereILike('full_name', searchTerm)
                        .orWhereILike('email', searchTerm);
                });
            }


            // Appliquer le tri
            const orderBy = payload.order_by || 'created_at_desc'; // Défaut
            query = applyOrderBy(query, orderBy, User.table); // applyOrderBy doit gérer Lucid Query Builder

            // Paginer les résultats
            const usersPaginate = await query.paginate(pageNum, limitNum);

            // Mapper les résultats pour exclure le mot de passe et ajouter les stats si nécessaire
            let list = usersPaginate.all().map(user => User.ParseUser(user));
            let stat_promises: any[] = []
            // Ajouter les stats si demandé
            if (payload.with_client_stats) {
                 stat_promises = list.map((user) => new Promise(async(rev)=>{
                    (user as any).stats = await this.calculateClientStats(user.id);
                    rev(user)
                }));
            }
            
            await Promise.allSettled(stat_promises); // Attendre toutes les promesses
            // Pas de message i18n car on retourne les données
            return response.ok({ list, meta: usersPaginate.getMeta() });

        } catch (error) {
            logger.error({ userId: auth.user!.id, params: payload, error: error.message, stack: error.stack }, 'Failed to get users');
            // 🌍 i18n
            return response.internalServerError({ message: t('user.fetchFailed'), error: error.message }); // Nouvelle clé
        }
    }

    
  /**
   * Récupère les statistiques globales des utilisateurs
   */
  async clients_stats({ request, response, auth ,bouncer}: HttpContext) {

        // 🔐 Authentification
        await auth.authenticate();
        // 🛡️ Permissions (pour voir la liste des utilisateurs)
        try {
            await bouncer.authorize('collaboratorAbility', [VIEW_USERS_PERMISSION]);
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') });
            }
            throw error;
        }

    const {
      with_active_users,
      with_total_clients,
      with_online_clients,
      with_satisfied_clients
    } = request.qs()
 
    console.log('Client stats',request.qs());
    
 if(! with_active_users&&
      !with_total_clients&&
      !with_online_clients&&
      !with_satisfied_clients){
        return {
          message:'turn true stats selectors, exmple /get_users_stats?with_active_users=true; All selector => with_active_users,with_total_clients,with_online_clients,with_satisfied_clients'
        }
      }
    const stats: any = {}

    // Utilisateurs actifs (dernière visite < 6 mois et authentifiés)
    if (with_active_users) {
      const sixMonthsAgo = DateTime.now().minus({ months: 6 }).toISO()
      const activeUsersCount = await Visite.query()
        .where('is_authenticate', true)
        .andWhere('created_at', '>=', sixMonthsAgo)
        .countDistinct('user_id as active_users')
        .first()
      stats.activeUsers = activeUsersCount?.$extras.active_users || 0
    }

    // Nombre total de clients
    if (with_total_clients) {
      const totalClients = await User.query()
        .count('* as total_clients')
        .first()
      stats.totalClients = totalClients?.$extras.total_clients || 0
    }

    // Clients en ligne (dernière visite < 1 heure)
    if (with_online_clients) {
      const oneHourAgo = DateTime.now().minus({ hours: 1 }).toISO()
      const onlineClientsCount = await Visite.query()
        .where('is_authenticate', true)
        .andWhere('created_at', '>=', oneHourAgo)
        .countDistinct('user_id as online_clients')
        .first()
      stats.onlineClients = onlineClientsCount?.$extras.online_clients || 0
    }

    // Clients satisfaits (moyenne des ratings)
    if (with_satisfied_clients) {
      
      const satisfactionStats = await Comment.query()
        .avg('rating as avg_rating')
        .countDistinct('user_id as rated_users')
        .first()
      stats.averageSatisfaction = satisfactionStats?.$extras.avg_rating ? parseFloat(satisfactionStats.$extras.avg_rating) : 0
      stats.ratedUsersCount = satisfactionStats?.$extras.rated_users || 0
    }

    console.log(stats);
    

    return response.ok({
      stats: Object.keys(stats).length > 0 ? stats : undefined
    })
  }

    /**
     * Méthode privée pour calculer les statistiques d'un client
     */
    private async calculateClientStats(userId: string): Promise<object> {
        const commentStatPromise = Comment.query()
            .where('user_id', userId)
            .avg('rating as average')
            .count('id as comment_count')
            .first();

        const orderCountPromise = UserOrder.query()
            .where('user_id', userId)
            .count('id as order_count')
            .first();

        // Calculer total dépensé (statut payé ?) et nombre total d'articles
        // S'adapter si la définition de "dépensé" change
        const orderTotalsPromise = UserOrder.query()
            .where('user_id', userId)
            // .where('payment_status', PaymentStatus.PAID) // Considérer seulement payé ?
            .sum('total_price as sum_price')
            .sum('items_count as sum_item') // Utiliser items_count de UserOrder
            .first();

        // Récupérer la dernière visite
        const lastVisitPromise = Visite.query()
            .where('user_id', userId)
            .orderBy('created_at', 'desc')
            .select('created_at')
            .first();

        // Exécuter en parallèle
        const [commentStat, orderCount, orderTotals, lastVisit] = await Promise.all([
            commentStatPromise,
            orderCountPromise,
            orderTotalsPromise,
            lastVisitPromise
        ]);

        console.log(commentStat?.$extras,lastVisit?.$attributes,orderTotals?.$extras,orderCount?.$extras);
        
        const stats = {
            avgRating: commentStat?.$extras.average ? parseFloat(commentStat.$extras.average).toFixed(2) : 0, // Arrondir
            commentsCount: commentStat?.$extras.comment_count ? parseInt(String(commentStat.$extras.comment_count)) : 0,
            productsBought: orderTotals?.$extras.sum_item ? parseInt(String(orderTotals.$extras.sum_item)) : 0,
            ordersCount: orderCount?.$extras.order_count ? parseInt(String(orderCount.$extras.order_count)) : 0,
            totalSpent: orderTotals?.$extras.sum_price ? parseFloat(orderTotals.$extras.sum_price).toFixed(2) : 0, // Arrondir
            lastVisit: lastVisit?.created_at?.toISO() ?? null, // Utiliser la date réelle ou null
        };
        // logger.debug({ userId, stats }, "Calculated client stats");
        return stats;
    }

}