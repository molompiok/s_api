//app/services/LoadMonitorService.ts
import lag from 'event-loop-lag';
import BullMQService from '#services/BullMQService'; // Pour envoyer les requêtes de scale
import env from '#start/env';
import logger from '@adonisjs/core/services/logger';
import { Queue } from 'bullmq';

/*
TODO
trouver un moyen de faire appele seulement appele down s'il y a d'autres services

*/

const CHECK_INTERVAL_MS = 30 * 1000; // Vérifier toutes les 30 secondes
const SCALE_UP_THRESHOLD_MS = 100;   // Seuil de lag pour demander scale up
const SCALE_DOWN_THRESHOLD_MS = 5; // Seuil de lag bas pour envisager scale down
const SCALE_DOWN_COOLDOWN_MINUTES = 10; // Attendre 10 min de faible lag avant de demander scale down
const REQUEST_COOLDOWN_MINUTES = 5;  // Ne pas redemander un scale (up ou down) pendant 5 min

interface MonitorState {
    lastRequestTimestamp: number;
    lowLagStartTimestamp: number | null;
    currentLagAvg: number; // Ou une autre métrique si on affine
}

export class LoadMonitorService {
    private intervalId: NodeJS.Timeout | null = null;
    private storeId: string | null|undefined = null;
    private serviceType: 'api' | 'theme';
    private state: MonitorState = {
        lastRequestTimestamp: 0,
        lowLagStartTimestamp: null,
        currentLagAvg: 0,
    };
    private lagSampler: ReturnType<typeof lag>; // Pour stocker l'instance du mesureur

    constructor(type: 'api' | 'theme') {
        this.serviceType = type;
        this.storeId = env.get(type === 'api' ? 'STORE_ID' : 'THEME_ID'); // Récupère l'ID pertinent
        this.lagSampler = lag(1000); // Mesure le lag toutes les secondes

        if (!this.storeId) {
             logger.error(`[LoadMonitorService] ${type === 'api' ? 'STORE_ID' : 'THEME_ID'} is missing! Monitoring disabled.`);
             // Gérer cette erreur - le service ne peut pas fonctionner sans ID
             return;
        }
         logger.info(`[LoadMonitorService ${this.storeId}] Initialized for ${this.serviceType}`);
    }

    public startMonitoring() {
        if (!this.storeId) return; // Ne démarre pas si pas d'ID
        if (this.intervalId) {
             logger.warn(`[LoadMonitorService ${this.storeId}] Monitoring already started.`);
            return;
        }

         logger.info(`[LoadMonitorService ${this.storeId}] Starting monitoring loop (interval: ${CHECK_INTERVAL_MS}ms)`);
        this.intervalId = setInterval(() => {
            this.checkLoadAndScale();
        }, CHECK_INTERVAL_MS);
    }

    public stopMonitoring() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
             logger.info(`[LoadMonitorService ${this.storeId}] Monitoring stopped.`);
        }
         // Arrêter l'échantillonneur de lag
        //  this.lagSampler
    }

    private async checkLoadAndScale() {
        if (!this.storeId) return; // Sécurité

        const currentLag = this.lagSampler(); // Récupère le lag moyen sur la dernière seconde
        this.state.currentLagAvg = currentLag; // Stocker pour info/debug

         logger.debug(`[LoadMonitorService ${this.storeId}] Current Event Loop Lag (avg): ${currentLag.toFixed(2)}ms`);

        const now = Date.now();

        // --- Logique Scale Up ---
        if (currentLag > SCALE_UP_THRESHOLD_MS) {
            logger.warn(`[LoadMonitorService ${this.storeId}] High Lag Detected: ${currentLag.toFixed(2)}ms (Threshold: ${SCALE_UP_THRESHOLD_MS}ms)`);
            if (now - this.state.lastRequestTimestamp > REQUEST_COOLDOWN_MINUTES * 60 * 1000) {
                logger.info(`[LoadMonitorService ${this.storeId}] Cooldown passed, requesting SCALE UP.`);
                await this.requestScale('up');
            } else {
                logger.info(`[LoadMonitorService ${this.storeId}] Scale UP request cooldown active.`);
            }
            // Réinitialiser le timer de faible lag si on détecte un pic
            this.state.lowLagStartTimestamp = null;
            return; // Ne pas vérifier le scale down si on vient de détecter un pic
        }

        // --- Logique Scale Down ---
        if (currentLag < SCALE_DOWN_THRESHOLD_MS) {
            if (this.state.lowLagStartTimestamp === null) {
                // Début d'une période de faible lag
                 logger.info(`[LoadMonitorService ${this.storeId}] Low lag period started (${currentLag.toFixed(2)}ms < ${SCALE_DOWN_THRESHOLD_MS}ms)`);
                this.state.lowLagStartTimestamp = now;
            } else {
                // Vérifier si la période de faible lag est assez longue
                const lowLagDurationMinutes = (now - this.state.lowLagStartTimestamp) / (60 * 1000);
                 logger.debug(`[LoadMonitorService ${this.storeId}] Low lag duration: ${lowLagDurationMinutes.toFixed(1)} minutes`);

                if (lowLagDurationMinutes >= SCALE_DOWN_COOLDOWN_MINUTES) {
                    logger.warn(`[LoadMonitorService ${this.storeId}] Sustained low lag detected for ${lowLagDurationMinutes.toFixed(1)} minutes.`);
                    if (now - this.state.lastRequestTimestamp > REQUEST_COOLDOWN_MINUTES * 60 * 1000) {
                         logger.info(`[LoadMonitorService ${this.storeId}] Cooldown passed, requesting SCALE DOWN.`);
                        await this.requestScale('down');
                    } else {
                        logger.info(`[LoadMonitorService ${this.storeId}] Scale DOWN request cooldown active.`);
                    }
                    // Réinitialiser le timer après la demande pour ne pas spammer
                    this.state.lowLagStartTimestamp = null;
                }
            }
        } else {
            // Le lag est revenu à la normale, réinitialiser le timer de faible lag
            if (this.state.lowLagStartTimestamp !== null) {
                 logger.info(`[LoadMonitorService ${this.storeId}] Lag normalized, resetting low lag timer.`);
                this.state.lowLagStartTimestamp = null;
            }
        }
    }

    private async requestScale(direction: 'up' | 'down') {
        if (!this.storeId) return;

        const event = direction === 'up' ? 'request_scale_up' : 'request_scale_down';
        const logCtx = { storeId: this.storeId, action: `auto-scale-${direction}`, serviceType: this.serviceType };
        logger.info(logCtx, 'Sending scale request to s_server');

        try {
            // Utiliser BullMQService pour s_api, ou le client BullMQ pour le thème
            let queue: Queue;
            if (this.serviceType === 'api') {
                queue = BullMQService.getServerToServerQueue();
            } else {
                // Assumer que le thème a une fonction similaire getThemeServerQueue()
                // ou importer directement getServerQueue du bullmqClient du thème
                const {default:BullMQService} = await import('#services/BullMQService'); // Chemin placeholder
                
                queue = BullMQService.getServerToServerQueue()
            }

            const scaleData = { serviceType: this.serviceType, serviceId: this.storeId, reason: 'Automatic load detection' };
            const jobId = `auto-scale-${direction}-${this.storeId}-${Date.now()}`;

            await queue.add(event, { event: event, data: scaleData }, { jobId });

             logger.info({ ...logCtx, jobId }, 'Scale request sent successfully.');
            this.state.lastRequestTimestamp = Date.now(); // Mettre à jour le timestamp de la dernière demande

        } catch (error) {
             logger.error({ ...logCtx, err: error }, 'Failed to send scale request');
             // Que faire ici ? Peut-être réessayer plus tard ? Pour l'instant on logue.
        }
    }
}

// Exporter une instance (ou gérer via IoC si dans Adonis)
// Il faut spécifier le type lors de l'instanciation
// export const apiLoadMonitor = new LoadMonitorService('api');
// export const themeLoadMonitor = new LoadMonitorService('theme'); // Si thème utilise ce service