import type { HttpContext } from '@adonisjs/core/http'

import env from '#start/env'
import BullMQService from '#services/BullMQService';

export default class DebugController {
    public async requestScaleUp({ response }: HttpContext) {
        const storeId = env.get('STORE_ID'); // Toujours récupérer depuis l'env

        if (!storeId) {
            return response.internalServerError('STORE_ID not configured in this s_api instance.');
        }

        try {
            console.log(`[s_api Debug Route ${storeId}] Requesting scale UP to s_server...`);
            const serverQueue = BullMQService.getServerToServerQueue(); // Obtenir via le service

            const scaleData = {
                serviceType: 'api',
                serviceId: storeId,
                reason: 'Manual debug request'
            };

            await serverQueue.add('request_scale_up',
                { event: 'request_scale_up', data: scaleData },
                { jobId: `scale-up-${storeId}-${Date.now()}` }
            );

            console.log(`[s_api Debug Route ${storeId}] Scale UP request sent to ${serverQueue.name}.`);
            return response.ok({ message: 'Scale UP request sent.' });

        } catch (error) {
            console.error(`[s_api Debug Route ${storeId}] Error sending scale UP request:`, error);
            return response.internalServerError({ message: 'Failed to send scale request.' });
        }
    }
}