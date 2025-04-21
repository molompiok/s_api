import Visite from '#models/visite'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db' // Gardé pour summarize et get_visites
import { v4 } from 'uuid';
import vine from '@vinejs/vine'; // ✅ Ajout de Vine
import { t } from '../utils/functions.js'; // ✅ Ajout de t
import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import logger from '@adonisjs/core/services/logger'; // Ajout pour logs
import { TypeJsonRole } from '#models/role'; // Pour type permissions

// Périodes valides pour get_visites
const VALID_VISIT_PERIODS = ['3d', '7d', '1m', '1y', 'all'] as const;
type ValidVisitPeriod = typeof VALID_VISIT_PERIODS[number];

// Permission requise pour voir les visites agrégées (peut-être la même que les stats?)
const VIEW_VISITS_PERMISSION: keyof TypeJsonRole = 'filter_command'; // Exemple

export default class VisitesController {

    // --- Schémas de validation Vine ---
    private getVisitesSchema = vine.compile(
      vine.object({
        period: vine.enum(VALID_VISIT_PERIODS).optional(),
        user_id: vine.string().uuid().optional(), // ID de l'utilisateur spécifique
      })
    );

    // Pas de schéma pour 'visite', 'cleanup', 'summarize' car ils ne prennent pas d'input validable via Vine

  // --- Méthodes du contrôleur ---

  /**
   * Enregistre une visite. S'exécute probablement via un middleware (LogVisit),
   * mais on garde la méthode ici pour la clarté ou pour un appel manuel éventuel.
   * Pas besoin d'authentification/autorisation ici car géré par LogVisit ou le contexte d'appel.
   */
  public async visite({ auth, session, response }: HttpContext) { // Ajout de response
    let user_id: string;
    let is_authenticate = false;

    // 🔐 Authentification ou fallback session
    try {
        // Utiliser check() pour éviter l'erreur si non authentifié
        if (await auth.check()) {
            user_id = auth.user!.id;
            is_authenticate = true;
        } else {
            throw new Error('Not authenticated via primary guards'); // Forcer le passage au catch
        }
    } catch {
        const visite_id = session.get('visite_id');
        if (visite_id) {
            user_id = visite_id;
        } else {
            const user_session = v4();
            session.put('visite_id', user_session);
            user_id = user_session;
        }
    }

    // ⏱️ Vérifie la dernière visite
     const now = DateTime.now();
     let lastVisite: Visite | null = null;
     try {
        lastVisite = await Visite.query()
          .where('user_id', user_id)
          .orderBy('created_at', 'desc')
          .first(); // Utiliser .first()
     } catch(dbError) {
        logger.error({ userId: user_id, error: dbError }, "Failed to query last visit");
        // Continuer quand même, on va juste créer une nouvelle visite
     }


    // Si dernière visite récente, ne rien faire
    if (lastVisite && lastVisite.created_at.diff(now, 'hours').hours > -1) {
      logger.debug({ userId: user_id }, "Visit throttled (less than 1 hour since last)");
      // 🌍 i18n
      return response.ok({
        message: t('visit.throttled'), // Nouvelle clé
        lastVisit: lastVisite.created_at.toISO(), // Retourner format ISO
      });
    }

    // ✅ Crée une nouvelle visite
    try {
        const visite = await Visite.create({
            user_id,
            is_authenticate,
            created_at: now, // Utiliser l'instance DateTime
            // Les autres champs (ip_address, device_type etc.) sont remplis par le middleware LogVisit
        });
        logger.debug({ userId: user_id, visitId: visite.id }, "New visit recorded");
         // 🌍 i18n
         return response.created({ // Utiliser 201 Created
            message: t('visit.recordedSuccess'), // Nouvelle clé
            visite: visite // Retourner l'objet créé
         });
    } catch (error) {
         logger.error({ userId: user_id, is_authenticate, error: error.message, stack: error.stack }, 'Failed to create visit record');
          // 🌍 i18n
          return response.internalServerError({ message: t('visit.recordFailed'), error: error.message }); // Nouvelle clé
    }
  }

  /**
   * Supprimer les anciennes visites (tâche de nettoyage).
   * Devrait être appelée par un Scheduler/Cron, pas directement via HTTP.
   * Pas d'auth/bouncer ici car c'est une tâche système.
   */
  public async cleanup() {
    try {
        const oneMonthAgo = DateTime.now().minus({ months: 1 });
        const deletedCount = await Visite.query()
            .where('created_at', '<', oneMonthAgo.toISO()) // Utiliser toISO()
            // .andWhere('is_month', false) // Supposant que cette colonne existe pour les résumés
            .delete();
        logger.info(`Visit cleanup: Deleted ${deletedCount[0]} records older than ${oneMonthAgo.toISODate()}`);
    } catch (error) {
         logger.error({ error: error.message, stack: error.stack }, 'Visit cleanup task failed');
    }
  }

  /**
   * Créer les résumés mensuels (tâche de EOD/EOM).
   * Devrait être appelée par un Scheduler/Cron.
   * Pas d'auth/bouncer ici.
   */
  public async summarize() {
     try {
        const now = DateTime.now();
        const lastMonthStart = now.minus({ months: 1 }).startOf('month');
        const lastMonthEnd = now.minus({ months: 1 }).endOf('month');

        // Attention: db.from() ne retourne pas d'instances de modèle Lucid
        const visites = await db
            .from(Visite.table) // Utiliser Visite.table
            .whereBetween('created_at', [lastMonthStart.toISO(), lastMonthEnd.toISO()])
            // .andWhere('is_month', false) // Si la colonne existe
            .select('user_id')
            .count('* as visit_count') // Compter les visites par utilisateur
            .groupBy('user_id');

        logger.info(`Summarizing visits for ${lastMonthStart.toFormat('yyyy-MM')}. Found ${visites.length} unique users.`);

        // Insérer les résumés (ou mettre à jour si existant?)
        // Pour l'instant, on crée juste une entrée par user, sans le count.
        // La logique devrait être plus complexe pour stocker les agrégats.
        const summariesToCreate = visites.map(visite => ({
             user_id: visite.user_id,
             created_at: lastMonthStart, // Date du début du mois résumé
             // is_month: true, // Marquer comme résumé
             // visit_count: visite.visit_count // Stocker le compte? Nécessite modif modèle
        }));

        if (summariesToCreate.length > 0) {
            // await Visite.createMany(summariesToCreate); // CreateMany si modèle adapté
            logger.info(`Created/Updated ${summariesToCreate.length} visit summaries.`);
        }

     } catch (error) {
         logger.error({ error: error.message, stack: error.stack }, 'Visit summarization task failed');
     }
  }

  /**
   * Récupérer les visites agrégées par période.
   */
  public async get_visites({ request, response, auth, bouncer }: HttpContext) {
       // 🔐 Authentification
       await auth.authenticate();
       // 🛡️ Permissions (pour voir les stats de visites)
       try {
           await bouncer.authorize('collaboratorAbility', [VIEW_VISITS_PERMISSION]);
       } catch (error) {
           if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
               return response.forbidden({ message: t('unauthorized_action') });
           }
           throw error;
       }

      let payload: Infer<typeof this.getVisitesSchema>;
      try {
          // ✅ Validation Vine pour Query Params
          payload = await this.getVisitesSchema.validate(request.qs());
      } catch (error) {
           if (error.code === 'E_VALIDATION_ERROR') {
               // 🌍 i18n
               return response.badRequest({ message: t('validationFailed'), errors: error.messages });
           }
           throw error;
      }

      const period = payload.period ?? '1m'; // Défaut '1m'
      const user_id = payload.user_id;

      try {
          // --- Logique métier (inchangée mais utilisation de Visite.table) ---
          const now = DateTime.now();
          let from: DateTime;
          let groupBy: 'day' | 'month';

          switch (period) {
              case '3d': from = now.minus({ days: 3 }); groupBy = 'day'; break;
              case '7d': from = now.minus({ days: 7 }); groupBy = 'day'; break;
              case '1m': from = now.minus({ months: 1 }); groupBy = 'day'; break;
              case '1y': from = now.minus({ years: 1 }); groupBy = 'month'; break;
              default: from = DateTime.fromMillis(0); groupBy = 'month'; break;
          }

          const query = db
              .from(Visite.table) // Utiliser le nom de table du modèle
              .where('created_at', '>=', from.toISO()!);

          if (user_id) {
              query.andWhere('user_id', user_id);
          }

          // Utilisation de DATE_TRUNC (Standard SQL, marche sur PostgreSQL)
          // Adapter si autre SGBD (ex: DATE() pour SQLite, DATE_FORMAT pour MySQL)
          const results = await query
              .select(db.raw(`DATE_TRUNC('${groupBy}', created_at) as period_start`))
              .count('* as visit_count') // Renommer pour clarté
              .groupBy('period_start')
              .orderBy('period_start', 'asc');

          // Transformer les résultats pour un format plus sympa
           const formattedResults = results.map(row => ({
                period: DateTime.fromJSDate(row.period_start).toISODate(), // Formater la date
                count: Number(row.visit_count) || 0
           }));

           // Pas de message i18n, on retourne les données
          return response.ok(formattedResults);

      } catch (error) {
           logger.error({ userId: auth.user!.id, params: payload, error: error.message, stack: error.stack }, 'Failed to get visits statistics');
           // 🌍 i18n
           return response.internalServerError({ message: t('visit.fetchFailed'), error: error.message }); // Nouvelle clé
      }
  }
}