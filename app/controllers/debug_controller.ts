// s_api/app/controllers/DebugController.ts

import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import BullMQService from '#services/BullMQService';
import logger from '@adonisjs/core/services/logger';
import { t } from '../utils/functions.js'; // ✅ Ajout de t
// Pas besoin de Vine ici car pas d'input client
import { TypeJsonRole } from '#models/role'; // Pour type permissions
// Pas besoin de Infer car pas de schéma Vine

// Permission requise pour accéder aux outils de debug (très sensible!)
const DEBUG_PERMISSION: keyof TypeJsonRole = 'manage_interface'; // Ou une permission dédiée 'debug_tools'

export default class DebugController {

    /**
     * Demande manuellement une augmentation des ressources (Scale Up) via BullMQ.
     * @param response - Réponse HTTP
     * @param auth - Service d'authentification
     * @param bouncer - Service d'autorisation
     */
    public async requestScaleUp({ response, auth, bouncer }: HttpContext) {
        // 🔐 Authentification
        await auth.authenticate();
        // 🛡️ Permissions (Seuls les utilisateurs autorisés peuvent scaler)
        try {
            await bouncer.authorize('collaboratorAbility', [DEBUG_PERMISSION]);
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                 // 🌍 i18n
                 return response.forbidden({ message: t('unauthorized_action') });
            }
            throw error;
        }

        const storeId = env.get('STORE_ID');
        const serviceType = 'api'; // s_api demande pour elle-même

        if (!storeId) {
            logger.error('[DebugController] STORE_ID not configured.');
             // 🌍 i18n
             return response.internalServerError({ message: t('debug.storeIdMissing') }); // Nouvelle clé
        }

        const logCtx = { storeId, action: 'scale-up', serviceType, actorId: auth.user!.id };
        logger.info(logCtx, 'Received manual debug request to scale UP');

        try {
            const serverQueue = BullMQService.getServerToServerQueue();
            const scaleData = { serviceType, serviceId: storeId, reason: 'Manual debug request' };
            const jobId = `scale-up-${storeId}-${Date.now()}`;

            await serverQueue.add('request_scale_up', { event: 'request_scale_up', data: scaleData }, { jobId });

            logger.info({ ...logCtx, jobId }, 'Scale UP request sent to s_server.');
             // 🌍 i18n
             return response.ok({ message: t('debug.scaleUpSent', { jobId }), jobId }); // Nouvelle clé

        } catch (error) {
            logger.error({ ...logCtx, err: error }, 'Error sending scale UP request');
            // 🌍 i18n
            return response.internalServerError({ message: t('debug.scaleUpFailed'), error: error.message }); // Nouvelle clé
        }
    }

    /**
     * Demande manuellement une diminution des ressources (Scale Down) via BullMQ.
      * @param response - Réponse HTTP
      * @param auth - Service d'authentification
      * @param bouncer - Service d'autorisation
     */
    public async requestScaleDown({ response, auth, bouncer }: HttpContext) {
        // 🔐 Authentification
        await auth.authenticate();
        // 🛡️ Permissions
        try {
            await bouncer.authorize('collaboratorAbility', [DEBUG_PERMISSION]);
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                 // 🌍 i18n
                 return response.forbidden({ message: t('unauthorized_action') });
            }
            throw error;
        }

        const storeId = env.get('STORE_ID');
        const serviceType = 'api'; // s_api demande pour elle-même

        if (!storeId) {
            logger.error('[DebugController] STORE_ID not configured.');
             // 🌍 i18n
             return response.internalServerError({ message: t('debug.storeIdMissing') });
        }

        const logCtx = { storeId, action: 'scale-down', serviceType, actorId: auth.user!.id };
        logger.info(logCtx, 'Received manual debug request to scale DOWN');

        try {
            const serverQueue = BullMQService.getServerToServerQueue();
            const scaleData = { serviceType, serviceId: storeId, reason: 'Manual debug request' };
            const jobId = `scale-down-${storeId}-${Date.now()}`;

            // Envoyer l'événement 'request_scale_down'
            await serverQueue.add('request_scale_down', { event: 'request_scale_down', data: scaleData }, { jobId });

            logger.info({ ...logCtx, jobId }, 'Scale DOWN request sent to s_server.');
             // 🌍 i18n
             return response.ok({ message: t('debug.scaleDownSent', { jobId }), jobId }); // Nouvelle clé

        } catch (error) {
            logger.error({ ...logCtx, err: error }, 'Error sending scale DOWN request');
             // 🌍 i18n
             return response.internalServerError({ message: t('debug.scaleDownFailed'), error: error.message }); // Nouvelle clé
        }
    }
}