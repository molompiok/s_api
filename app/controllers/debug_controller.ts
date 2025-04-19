// s_api/app/controllers/DebugController.ts

import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import BullMQService from '#services/BullMQService';
import logger from '@adonisjs/core/services/logger'; // Utiliser le logger

export default class DebugController {

    // Méthode existante pour Scale Up
    public async requestScaleUp({ response }: HttpContext) {
        const storeId = env.get('STORE_ID');
        const serviceType = 'api'; // Puisque c'est s_api qui demande

        if (!storeId) {
            logger.error('[DebugController] STORE_ID not configured.');
            return response.internalServerError({ message: 'STORE_ID not configured in this s_api instance.' });
        }

        const logCtx = { storeId, action: 'scale-up', serviceType };
        logger.info(logCtx, 'Received debug request to scale UP');

        try {
            const serverQueue = BullMQService.getServerToServerQueue();
            const scaleData = { serviceType, serviceId: storeId, reason: 'Manual debug request' };
            const jobId = `scale-up-${storeId}-${Date.now()}`;

            await serverQueue.add('request_scale_up', { event: 'request_scale_up', data: scaleData }, { jobId });

            logger.info({ ...logCtx, jobId }, 'Scale UP request sent to s_server.');
            return response.ok({ message: 'Scale UP request sent.', jobId });

        } catch (error) {
            logger.error({ ...logCtx, err: error }, 'Error sending scale UP request');
            return response.internalServerError({ message: 'Failed to send scale UP request.' });
        }
    }

    // >>> NOUVELLE MÉTHODE pour Scale Down <<<
    public async requestScaleDown({ response }: HttpContext) {
        const storeId = env.get('STORE_ID');
        const serviceType = 'api'; // s_api demande pour elle-même

        if (!storeId) {
             logger.error('[DebugController] STORE_ID not configured.');
            return response.internalServerError({ message: 'STORE_ID not configured in this s_api instance.' });
        }

        const logCtx = { storeId, action: 'scale-down', serviceType };
        logger.info(logCtx, 'Received debug request to scale DOWN');

        try {
            const serverQueue = BullMQService.getServerToServerQueue();
            const scaleData = { serviceType, serviceId: storeId, reason: 'Manual debug request' };
            const jobId = `scale-down-${storeId}-${Date.now()}`;

            // Envoyer l'événement 'request_scale_down'
            await serverQueue.add('request_scale_down', { event: 'request_scale_down', data: scaleData }, { jobId });

            logger.info({ ...logCtx, jobId }, 'Scale DOWN request sent to s_server.');
            return response.ok({ message: 'Scale DOWN request sent.', jobId });

        } catch (error) {
             logger.error({ ...logCtx, err: error }, 'Error sending scale DOWN request');
            return response.internalServerError({ message: 'Failed to send scale DOWN request.' });
        }
    }
}