import type { HttpContext } from '@adonisjs/core/http'
import UserBrowserSubscription from '#models/user_browser_subscription'
import UserNotificationContextSubscription from '#models/user_notification_context_subscription'
import { UAParser } from 'ua-parser-js'
import vine from '@vinejs/vine'
import { Infer } from '@vinejs/vine/types'
import logger from '@adonisjs/core/services/logger'
import { t } from '../utils/functions.js' // Assure-toi que ce chemin est correct
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { securityService } from '#services/SecurityService'
import User from '#models/user'
import PushNotificationService, { PushPayload } from '#services/PushNotificationService'

// Permission pour cet endpoint de test (à définir dans ton TypeJsonRole)


export default class NotificationSettingsController {

    // --- Schémas de validation Vine ---
    private registerDeviceSchema = vine.compile(
        vine.object({
            subscription: vine.object({ // L'objet PushSubscription.toJSON()
                endpoint: vine.string().url(),
                expirationTime: vine.number().nullable().optional(), // Peut être null
                keys: vine.object({
                    p256dh: vine.string(),
                    auth: vine.string(),
                }),
            }),
        })
    );

    private deviceIdParamsSchema = vine.compile(
        vine.object({
            deviceId: vine.string().uuid(),
        })
    );

    private updateDeviceStatusSchema = vine.compile(
        vine.object({
            is_active: vine.boolean(),
        })
    );

    private subscribeToContextSchema = vine.compile(
        vine.object({
            context_name: vine.string().trim().minLength(1).maxLength(100),
            context_id: vine.string().trim().minLength(1).maxLength(255),
            user_browser_subscription_id: vine.string().uuid().optional().nullable(), // Pour lier à un appareil spécifique
            is_active: vine.boolean().optional(), // Défaut à true si non fourni
        })
    );

    private listContextsSchema = vine.compile(
        vine.object({
            context_name: vine.string().trim().optional(),
            context_id: vine.string().trim().optional(),
            is_active: vine.boolean().optional(),
            user_browser_subscription_id: vine.string().uuid().optional(),
        })
    );

    private contextSubscriptionIdParamsSchema = vine.compile(
        vine.object({
            subscriptionId: vine.string().uuid(),
        })
    );


    /**
     * @registerOrUpdateDevice
     * Enregistre un nouveau navigateur/appareil pour les notifications push de l'utilisateur
     * ou met à jour un abonnement existant basé sur l'endpoint.
     * Endpoint: PUT /notifications/device (ou POST si tu préfères pour la création)
     */
    async registerOrUpdateDevice({ request, auth, response }: HttpContext) {
        const user = await securityService.authenticate({ auth, request });

        let payload: Infer<typeof this.registerDeviceSchema>;
        try {
            payload = await this.registerDeviceSchema.validate(request.body());
        } catch (error) {
            logger.warn({ userId: user.id, validationErrors: error.messages, body: request.body() }, 'Register device validation failed');
            return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
        }

        const { subscription } = payload;
        const userAgentString = request.header('User-Agent') || '';
        const parser = new UAParser(userAgentString);
        const uaResult = parser.getResult();

        const trx = await db.transaction();
        try {
            // Chercher un abonnement existant par endpoint pour cet utilisateur
            let userBrowserSubscription = await UserBrowserSubscription.query({ client: trx })
                .where('user_id', user.id)
                .where('endpoint', subscription.endpoint)
                .first();

            const subscriptionData = {
                user_id: user.id,
                endpoint: subscription.endpoint,
                p256dhKey: subscription.keys.p256dh,
                authKey: subscription.keys.auth,
                user_agent_raw: userAgentString.substring(0, 255), // Limiter la longueur si besoin
                browser_name: uaResult.browser.name?.substring(0, 100),
                browser_version: uaResult.browser.version?.substring(0, 50),
                os_name: uaResult.os.name?.substring(0, 100),
                os_version: uaResult.os.version?.substring(0, 50),
                device_type: (uaResult.device.type || 'desktop').substring(0, 50),
                is_active: true, // Toujours activer/réactiver lors d'un (ré)enregistrement
                last_used_at: DateTime.now(),
            };

            if (userBrowserSubscription) {
                // Mettre à jour l'abonnement existant (clés peuvent changer, réactiver)
                userBrowserSubscription.merge(subscriptionData);
                await userBrowserSubscription.save();
                logger.info({ userId: user.id, subscriptionId: userBrowserSubscription.id }, 'User browser subscription updated');
            } else {
                // Créer un nouvel abonnement
                userBrowserSubscription = await UserBrowserSubscription.create(subscriptionData, { client: trx });
                logger.info({ userId: user.id, subscriptionId: userBrowserSubscription.id }, 'New user browser subscription created');
            }

            await trx.commit();
            return response.ok({ message: t('notifications.deviceRegisteredSuccess'), device: userBrowserSubscription });

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user.id, endpoint: subscription.endpoint, error: error.message }, 'Failed to register/update device');
            return response.internalServerError({ message: t('notifications.deviceRegistrationFailed'), error: error.message });
        }
    }

    /**
     * @listUserDevices
     * Liste tous les navigateurs/appareils enregistrés pour l'utilisateur authentifié.
     * Endpoint: GET /notifications/devices
     */
    async listUserDevices({ auth, response , request }: HttpContext) {
        const user = await securityService.authenticate({ auth, request });

        try {
            const devices = await UserBrowserSubscription.query()
                .where('user_id', user.id)
                .orderBy('created_at', 'desc');

            return response.ok(devices);
        } catch (error) {
            logger.error({ userId: user.id, error: error.message }, 'Failed to list user devices');
            return response.internalServerError({ message: t('notifications.listDevicesFailed'), error: error.message });
        }
    }

    /**
     * @updateDeviceStatus
     * Active ou désactive les notifications pour un appareil spécifique de l'utilisateur.
     * Endpoint: PUT /notifications/devices/{deviceId}
     */
    async updateDeviceStatus({ params: routeParams, request, auth, response }: HttpContext) {
        const user = await securityService.authenticate({ auth, request });

        let validatedParams: Infer<typeof this.deviceIdParamsSchema>;
        let payload: Infer<typeof this.updateDeviceStatusSchema>;
        try {
            validatedParams = await this.deviceIdParamsSchema.validate(routeParams);
            payload = await this.updateDeviceStatusSchema.validate(request.body());
        } catch (error) {
            return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
        }

        const trx = await db.transaction();
        try {
            const device = await UserBrowserSubscription.query({ client: trx })
                .where('id', validatedParams.deviceId)
                .where('user_id', user.id) // S'assurer que l'appareil appartient à l'utilisateur
                .first();

            if (!device) {
                await trx.rollback();
                return response.notFound({ message: t('notifications.deviceNotFound') });
            }

            device.is_active = payload.is_active;
            if (payload.is_active) {
                device.last_used_at = DateTime.now(); // Marquer comme utilisé si réactivé
            }
            await device.save();
            await trx.commit();

            logger.info({ userId: user.id, deviceId: device.id, isActive: device.is_active }, 'Device notification status updated');
            return response.ok({ message: t('notifications.deviceStatusUpdated'), device });
        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user.id, deviceId: validatedParams.deviceId, error: error.message }, 'Failed to update device status');
            return response.internalServerError({ message: t('notifications.deviceStatusUpdateFailed'), error: error.message });
        }
    }

    /**
     * @removeDevice
     * Supprime un appareil/navigateur enregistré pour les notifications.
     * Endpoint: DELETE /notifications/devices/{deviceId}
     */
    async removeDevice({ params: routeParams, auth, response, request }: HttpContext) {
        const user = await securityService.authenticate({ auth, request });

        let validatedParams: Infer<typeof this.deviceIdParamsSchema>;
        try {
            validatedParams = await this.deviceIdParamsSchema.validate(routeParams);
        } catch (error) {
            return response.badRequest({ message: t('validationFailed'), errors: error.messages });
        }

        const trx = await db.transaction();
        try {
            const device = await UserBrowserSubscription.query({ client: trx })
                .where('id', validatedParams.deviceId)
                .where('user_id', user.id)
                .first();

            if (!device) {
                await trx.rollback();
                return response.notFound({ message: t('notifications.deviceNotFound') });
            }

            // Supprimer aussi les abonnements de contexte liés à cet appareil spécifique
            await UserNotificationContextSubscription.query({ client: trx })
                .where('user_browser_subscription_id', device.id)
                .delete();

            await device.delete();
            await trx.commit();

            logger.info({ userId: user.id, deviceId: validatedParams.deviceId }, 'Device removed successfully');
            return response.ok({ message: t('notifications.deviceRemovedSuccess'), isDeleted: true });
        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user.id, deviceId: validatedParams.deviceId, error: error.message }, 'Failed to remove device');
            return response.internalServerError({ message: t('notifications.deviceRemoveFailed'), error: error.message });
        }
    }

    // --- Gestion des Contextes de Notification ---

    /**
     * @subscribeToContext
     * Permet à un utilisateur de s'abonner à des notifications pour un contexte spécifique.
     * Endpoint: POST /notifications/contexts
     */
    async subscribeToContext({ request, auth, response }: HttpContext) {
        const user = await securityService.authenticate({ auth, request });

        let payload: Infer<typeof this.subscribeToContextSchema>;
        try {
            payload = await this.subscribeToContextSchema.validate(request.body());
        } catch (error) {
            return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
        }

        const trx = await db.transaction();
        try {
            // Vérifier si l'appareil spécifié (user_browser_subscription_id) appartient à l'utilisateur (si fourni)
            if (payload.user_browser_subscription_id) {
                const device = await UserBrowserSubscription.query({ client: trx })
                    .where('id', payload.user_browser_subscription_id)
                    .where('user_id', user.id)
                    .first();
                if (!device) {
                    await trx.rollback();
                    return response.badRequest({ message: t('notifications.deviceNotFoundForContext') });
                }
            }

            // Vérifier si un abonnement au contexte existe déjà (pour éviter les doublons)
            const existingSubscription = await UserNotificationContextSubscription.query({ client: trx })
                .where('user_id', user.id)
                .where('context_name', payload.context_name)
                .where('context_id', payload.context_id)
                // Si user_browser_subscription_id est fourni, le chercher, sinon s'assurer qu'il est null
                .if(payload.user_browser_subscription_id,
                    q => q.where('user_browser_subscription_id', payload.user_browser_subscription_id!),
                    q => q.whereNull('user_browser_subscription_id')
                )
                .first();

            if (existingSubscription) {
                // Si existant, le réactiver s'il était inactif
                if (!existingSubscription.is_active || (payload.is_active !== undefined && payload.is_active !== existingSubscription.is_active)) {
                    existingSubscription.is_active = payload.is_active ?? true;
                    await existingSubscription.save();
                    await trx.commit();
                    logger.info({ userId: user.id, context: payload, subscriptionId: existingSubscription.id }, 'Notification context subscription reactivated/updated.');
                    return response.ok({ message: t('notifications.contextSubscriptionUpdated'), subscription: existingSubscription });
                }
                await trx.rollback(); // Pas de changement nécessaire
                return response.ok({ message: t('notifications.alreadySubscribedToContext'), subscription: existingSubscription });
            }

            const newSubscription = await UserNotificationContextSubscription.create({
                user_id: user.id,
                context_name: payload.context_name,
                context_id: payload.context_id,
                user_browser_subscription_id: payload.user_browser_subscription_id || null,
                is_active: payload.is_active ?? true,
            }, { client: trx });

            await trx.commit();
            logger.info({ userId: user.id, context: payload, subscriptionId: newSubscription.id }, 'Subscribed to notification context.');
            return response.created({ message: t('notifications.contextSubscribedSuccess'), subscription: newSubscription });
        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user.id, context: payload, error: error.message }, 'Failed to subscribe to notification context');
            return response.internalServerError({ message: t('notifications.contextSubscriptionFailed'), error: error.message });
        }
    }

    /**
     * @listContextSubscriptions
     * Liste les contextes de notification auxquels l'utilisateur est abonné.
     * Endpoint: GET /notifications/contexts
     */
    async listContextSubscriptions({ request, auth, response }: HttpContext) {
        const user = await securityService.authenticate({ auth, request });

        let payload: Infer<typeof this.listContextsSchema>;
        try {
            payload = await this.listContextsSchema.validate(request.qs());
        } catch (error) {
            return response.badRequest({ message: t('validationFailed'), errors: error.messages });
        }

        try {
            const query = UserNotificationContextSubscription.query().where('user_id', user.id);
            if (payload.context_name) query.where('context_name', payload.context_name);
            if (payload.context_id) query.where('context_id', payload.context_id);
            if (payload.is_active !== undefined) query.where('is_active', payload.is_active);
            if (payload.user_browser_subscription_id) query.where('user_browser_subscription_id', payload.user_browser_subscription_id);

            const subscriptions = await query.orderBy('created_at', 'desc');
            return response.ok(subscriptions);
        } catch (error) {
            logger.error({ userId: user.id, params: payload, error: error.message }, 'Failed to list notification context subscriptions');
            return response.internalServerError({ message: t('notifications.listContextsFailed'), error: error.message });
        }
    }

    /**
     * @unsubscribeFromContext
     * Désabonne l'utilisateur d'un contexte de notification spécifique.
     * Endpoint: DELETE /notifications/contexts/{subscriptionId}
     */
    async unsubscribeFromContext({ params: routeParams, auth, response, request }: HttpContext) {
        const user = await securityService.authenticate({ auth, request });

        let validatedParams: Infer<typeof this.contextSubscriptionIdParamsSchema>;
        try {
            validatedParams = await this.contextSubscriptionIdParamsSchema.validate(routeParams);
        } catch (error) {
            return response.badRequest({ message: t('validationFailed'), errors: error.messages });
        }

        const trx = await db.transaction();
        try {
            const subscription = await UserNotificationContextSubscription.query({ client: trx })
                .where('id', validatedParams.subscriptionId)
                .where('user_id', user.id) // S'assurer que ça appartient à l'utilisateur
                .first();

            if (!subscription) {
                await trx.rollback();
                return response.notFound({ message: t('notifications.contextSubscriptionNotFound') });
            }

            await subscription.delete();
            await trx.commit();
            logger.info({ userId: user.id, subscriptionId: validatedParams.subscriptionId }, 'Unsubscribed from notification context.');
            return response.ok({ message: t('notifications.contextUnsubscribedSuccess'), isDeleted: true });
        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user.id, subscriptionId: validatedParams.subscriptionId, error: error.message }, 'Failed to unsubscribe from context');
            return response.internalServerError({ message: t('notifications.contextUnsubscribeFailed'), error: error.message });
        }
    }

    //-----------------------------------------------------------------------
    //--------------                 TEST                  ------------------
    //-----------------------------------------------------------------------

    private pingNotificationSchema = vine.compile(
    vine.object({
      user_id: vine.string().uuid(), // L'ID de l'utilisateur à qui envoyer la notification
      payload: vine.object({       // L'objet PushPayload complet
        title: vine.string().trim().minLength(1),
        options: vine.object({
          body: vine.string().trim().optional(),
          icon: vine.string().url().optional().nullable(),
          image: vine.string().url().optional().nullable(),
          badge: vine.string().url().optional().nullable(),
          vibrate: vine.array(vine.number().positive()).optional().nullable(), // ex: [200, 100, 200]
          tag: vine.string().trim().optional().nullable(),
          renotify: vine.boolean().optional(),
          requireInteraction: vine.boolean().optional(),
          actions: vine.array(vine.object({
            action: vine.string().trim(),
            title: vine.string().trim(),
            icon: vine.string().url().optional().nullable(),
            url: vine.string().url().optional().nullable(), // URL à ouvrir pour cette action
          })).optional().nullable(),
          data: vine.any().optional().nullable(), // Données additionnelles
        }),
      }),
      context: vine.object({ // Optionnel: pour tester l'envoi par contexte
        name: vine.string().trim().minLength(1),
        id: vine.string().trim().minLength(1),
      }).optional().nullable(),
    })
  );
 /**
   * @pingNotification
   * Envoie une notification de test à un utilisateur avec un payload spécifié.
   * Permet de tester l'envoi direct ou par contexte.
   * Protégé par permission administrateur.
   * Endpoint: POST /notifications/ping-test
   */
  async pingNotification({ request, auth, response }: HttpContext) {
    const actor = await securityService.authenticate({auth, request}); // L'admin qui fait la requête
    try {
      // Utilise la permission définie (ou une permission admin générale)
      await request.ctx?.bouncer.authorize('superAdmin');
    } catch (error) {
      return response.forbidden({ message: t('unauthorized_action') });
    }

    let payloadRequest: Infer<typeof this.pingNotificationSchema>;
    try {
      payloadRequest = await this.pingNotificationSchema.validate(request.body());
    } catch (error) {
      logger.warn({ actorId: actor.id, validationErrors: error.messages, body: request.body() }, 'Ping notification validation failed');
      return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
    }

    const { user_id: targetUserId, payload: notificationPayload, context } = payloadRequest;

    try {
      // Vérifier si l'utilisateur cible existe (optionnel mais bon à faire)
      const targetUser = await User.find(targetUserId);
      if (!targetUser) {
        return response.notFound({ message: t('user.notFound', { id: targetUserId }) });
      }

      let message = '';

      if (context && context.name && context.id) {
        // Tester l'envoi via contexte
        logger.info({ actorId: actor.id, targetUserId, context, payload: notificationPayload }, 'Sending test notification via context');
        // La méthode sendNotificationToUserForContext ne retourne pas de booléen directement,
        // mais on peut supposer le succès si elle ne lève pas d'erreur.
        // Pour un retour plus précis, il faudrait que le service retourne des infos.
        await PushNotificationService.sendNotificationToUserForContext(
          targetUserId,
          context.name,
          context.id,
          notificationPayload as PushPayload // Assurer le type
        );
        message = t('notifications.testSentToContextSuccess', { contextName: context.name, userId: targetUserId });

      } else {
        // Tester l'envoi direct à l'utilisateur
        logger.info({ actorId: actor.id, targetUserId, payload: notificationPayload }, 'Sending direct test notification to user');
        await PushNotificationService.sendNotificationToUser(
          targetUserId,
          notificationPayload as PushPayload
        );
        message = t('notifications.testSentDirectlySuccess', { userId: targetUserId });
      }
      
      // Note: PushNotificationService.sendNotificationToUser/Context gère déjà les erreurs
      // et le logging individuel des tentatives d'envoi aux appareils.
      // Le succès ici signifie que les jobs d'envoi ont été initiés.

      return response.ok({ success: true, message });

    } catch (error) {
      logger.error({ actorId: actor.id, targetUserId, context, error: error.message }, 'Failed to send test notification');
      return response.internalServerError({ success: false, message: t('notifications.testSendFailed'), error: error.message });
    }
  }

}