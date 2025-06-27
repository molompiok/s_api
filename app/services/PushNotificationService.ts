//app/services/PushNotificationService.ts
import webpush, { PushSubscription } from 'web-push'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import UserBrowserSubscription from '#models/user_browser_subscription'
import UserNotificationContextSubscription from '#models/user_notification_context_subscription'

// Interface pour le payload standardisé de nos notifications
export interface PushPayloadOptions {
    body?: string;
    icon?: string; // URL d'une icône (ex: logo du store ou icône spécifique à la notif)
    image?: string; // URL d'une image plus grande
    badge?: string; // URL d'un badge (pour Android)
    vibrate?: number[]; // ex: [200, 100, 200]
    tag?: string; // Pour regrouper/remplacer les notifications
    renotify?: boolean;
    requireInteraction?: boolean;
    actions?: { action: string; title: string; icon?: string; url?: string }[]; // Boutons d'action avec URL optionnelle
    data?: any; // Données supplémentaires à passer au SW (ex: URL à ouvrir au clic)
}
export interface PushPayload {
    title: string;
    options: PushPayloadOptions;
}

class PushNotificationService {
    private vapidPublicKey: string|undefined;
    private vapidPrivateKey: string|undefined;
    private vapidSubject: string|undefined;
    private isConfigured: boolean = false;

    constructor() {
        this.vapidPublicKey = env.get('VAPID_PUBLIC_KEY');
        this.vapidPrivateKey = env.get('VAPID_PRIVATE_KEY');
        this.vapidSubject = env.get('VAPID_SUBJECT'); // ex: 'mailto:contact@votresite.com'

        if (this.vapidPublicKey && this.vapidPrivateKey && this.vapidSubject) {
            try {
                webpush.setVapidDetails(
                    this.vapidSubject,
                    this.vapidPublicKey,
                    this.vapidPrivateKey
                );
                this.isConfigured = true;
                logger.info('[PushNotificationService] VAPID details configured successfully.');
            } catch (error) {
                logger.fatal({ err: error }, '[PushNotificationService] FATAL: Failed to set VAPID details. Push notifications will not work.');
            }
        } else {
            logger.error('[PushNotificationService] VAPID keys or subject are missing in environment variables. Push notifications will be disabled.');
        }
    }

    /**
     * Envoie une notification à un abonnement spécifique.
     * @param subscriptionObject L'objet PushSubscription (endpoint, keys.p256dh, keys.auth)
     * @param payload L'objet PushPayload (title, options)
     * @param subscriptionDbId L'ID de l'abonnement dans la base de données (pour suppression si invalide)
     */
    public async sendNotificationToDevice(
        subscriptionObject: PushSubscription, // Type de web-push
        payload: PushPayload,
        subscriptionDbId?: string // ID de l'enregistrement UserBrowserSubscription
    ): Promise<boolean> {
        if (!this.isConfigured) {
            logger.warn('[PushNotificationService] Service not configured. Skipping notification send.');
            return false;
        }

        try {
            console.log({
                vapidSubject:this.vapidSubject,
                vapidPublicKey:this.vapidPublicKey,
                vapidPrivateKey:this.vapidPrivateKey
            });
            
            console.log({payload},subscriptionObject);
            
            logger.info({ endpoint: subscriptionObject.endpoint, title: payload.title }, 'Attempting to send push notification');
            await webpush.sendNotification(subscriptionObject, JSON.stringify(payload));
            logger.info({ endpoint: subscriptionObject.endpoint, title: payload.title }, 'Push notification sent successfully');

            // Mettre à jour last_used_at pour cet appareil
            if (subscriptionDbId) {
                UserBrowserSubscription.query()
                    .where('id', subscriptionDbId)
                    .update({ last_used_at: new Date() })
                    .catch(err => logger.error({ err, subscriptionDbId }, "Failed to update last_used_at for subscription"));
            }
            return true;
        } catch (error: any) {
            logger.error({ endpoint: subscriptionObject.endpoint, title: payload.title, err: error.message, statusCode: error.statusCode }, 'Failed to send push notification');

            try {
                // Gérer les erreurs courantes de web-push
                if (error.statusCode === 404 || error.statusCode === 410) {
                    // L'abonnement n'est plus valide (désinscrit, expiré, etc.)
                    logger.warn({ endpoint: subscriptionObject.endpoint, statusCode: error.statusCode }, 'Push subscription is invalid. Deleting from DB.');
                    if (subscriptionDbId) {
                        await UserBrowserSubscription.query().where('id', subscriptionDbId).delete()
                            .catch(delErr => logger.error({ delErr, subscriptionDbId }, "Failed to delete invalid subscription from DB"));
                    } else {
                        // Si on n'a pas l'ID DB mais qu'on a l'endpoint, on peut essayer de le supprimer par endpoint
                        await UserBrowserSubscription.query().where('endpoint', subscriptionObject.endpoint).delete()
                            .catch(delErr => logger.error({ delErr, endpoint: subscriptionObject.endpoint }, "Failed to delete invalid subscription by endpoint from DB"));
                    }
                } else if (error.statusCode === 400 || error.statusCode === 403) {
                    // Problèmes avec les clés VAPID ou l'autorisation du service push
                    logger.error({ statusCode: error.statusCode, body: error.body }, "VAPID key issue or push service authorization error.");
                }
            } catch (error) { }
            // Autres erreurs (réseau, etc.) seront juste loguées.
            return false;
        }
    }

    /**
     * Envoie une notification à tous les appareils actifs d'un utilisateur.
     * @param userId L'ID de l'utilisateur.
     * @param payload Le contenu de la notification.
     */
    public async sendNotificationToUser(userId: string, payload: PushPayload): Promise<void> {
        if (!this.isConfigured) return;

        logger.info({ userId, title: payload.title }, 'Preparing to send notification to user\'s active devices.');
        const activeSubscriptions = await UserBrowserSubscription.query()
            .where('user_id', userId)
            .where('is_active', true);

        if (!activeSubscriptions.length) {
            logger.info({ userId }, 'No active devices found for user to send notification.');
            return;
        }

        const sendPromises = activeSubscriptions.map(sub =>
            this.sendNotificationToDevice(sub.toPushSubscriptionJSON(), payload, sub.id)
        );

        const results = await Promise.allSettled(sendPromises);
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                logger.error({ userId, subscriptionId: activeSubscriptions[index].id, error: result.reason }, "Error in one of sendNotificationToUser promises");
            }
        });
    }

    /**
     * Envoie une notification à un utilisateur s'il est abonné à un contexte spécifique.
     * @param userId L'ID de l'utilisateur.
     * @param contextName Nom du contexte (ex: 'order_update').
     * @param contextId ID de l'entité du contexte (ex: ID de la commande).
     * @param payload Le contenu de la notification.
     */
    public async sendNotificationToUserForContext(
        userId: string,
        contextName: string,
        contextId: string,
        payload: PushPayload
    ): Promise<void> {
        if (!this.isConfigured) return;

        logger.info({ userId, contextName, contextId, title: payload.title }, 'Checking context subscription for user.');

        // 1. Vérifier si l'utilisateur est abonné à ce contexte globalement ou pour un appareil spécifique
        const contextSubscriptions = await UserNotificationContextSubscription.query()
            .where('user_id', userId)
            .where('context_name', contextName)
            .where('context_id', contextId)
            .where('is_active', true)
            .preload('browserSubscription'); // Précharger l'appareil si lié

        if (!contextSubscriptions.length) {
            logger.info({ userId, contextName, contextId }, 'User not subscribed to this context or subscription inactive.');
            return;
        }

        // Collecter tous les UserBrowserSubscription valides auxquels envoyer
        const targetDevices = new Map<string, UserBrowserSubscription>();

        for (const ctxSub of contextSubscriptions) {
            if (ctxSub.user_browser_subscription_id && ctxSub.browserSubscription && ctxSub.browserSubscription.is_active) {
                // Abonnement de contexte lié à un appareil spécifique et actif
                targetDevices.set(ctxSub.browserSubscription.id, ctxSub.browserSubscription);
            } else if (!ctxSub.user_browser_subscription_id) {
                // Abonnement de contexte global à l'utilisateur -> envoyer à tous ses appareils actifs
                const userActiveDevices = await UserBrowserSubscription.query()
                    .where('user_id', userId)
                    .where('is_active', true);
                userActiveDevices.forEach(device => targetDevices.set(device.id, device));
            }
        }

        if (targetDevices.size === 0) {
            logger.info({ userId, contextName, contextId }, 'No active target devices found for this context subscription.');
            return;
        }

        logger.info({ userId, contextName, contextId, deviceCount: targetDevices.size }, `Sending context notification to ${targetDevices.size} device(s).`);
        const sendPromises = Array.from(targetDevices.values()).map(deviceSub =>
            this.sendNotificationToDevice(deviceSub.toPushSubscriptionJSON(), payload, deviceSub.id)
        );

        // Gérer les résultats des promesses (optionnel pour l'instant, mais bon pour le logging)
        await Promise.allSettled(sendPromises);
    }
}

// Exporter une instance unique (singleton) pour une utilisation facile dans l'application
export default new PushNotificationService();