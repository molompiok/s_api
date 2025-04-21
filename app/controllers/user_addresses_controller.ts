import UserAddress from '#models/user_address'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { v4 } from 'uuid'
import vine from '@vinejs/vine'; // ✅ Ajout de Vine
import { t } from '../utils/functions.js'; // ✅ Ajout de t
import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import logger from '@adonisjs/core/services/logger'; // Ajout pour logs
// Pas besoin de Bouncer ici, les actions sont liées à l'utilisateur lui-même

export default class UserAddressesController {

    // --- Schémas de validation Vine ---
    private createAddressSchema = vine.compile(
        vine.object({
            name: vine.string().trim().minLength(1).maxLength(255),
            longitude: vine.number().min(-180).max(180),
            latitude: vine.number().min(-90).max(90),
        })
    );

    private getAddressSchema = vine.compile(
        vine.object({
            id: vine.string().uuid().optional(), // ID de l'adresse spécifique (query param)
        })
    );

    private updateAddressSchema = vine.compile(
        vine.object({
            id: vine.string().uuid(), // ID de l'adresse à mettre à jour (dans le body)
            name: vine.string().trim().minLength(1).maxLength(255).optional(),
            longitude: vine.number().min(-180).max(180).optional(),
            latitude: vine.number().min(-90).max(90).optional(),
        })
    );

     private deleteAddressParamsSchema = vine.compile(
         vine.object({
             id: vine.string().uuid(), // ID de l'adresse dans l'URL
         })
     );

    // --- Méthodes du contrôleur ---

    async create_user_address({ request, response , auth }: HttpContext) {
        // 🔐 Authentification (requise pour ajouter une adresse)
        await auth.authenticate();
        const user = auth.user!; // Garanti non null

        const id = v4();
        const trx = await db.transaction();
        let payload: Infer<typeof this.createAddressSchema>;
        try {
            // ✅ Validation Vine (Body)
            payload = await this.createAddressSchema.validate(request.body());

            // --- Logique métier ---
            const user_address = await UserAddress.create(
                {
                    id,
                    user_id: user.id, // Lier à l'utilisateur authentifié
                    name: payload.name,
                    longitude: payload.longitude,
                    latitude: payload.latitude,
                },
                { client: trx }
            );

            await trx.commit();
            logger.info({ userId: user.id, addressId: user_address.id }, 'User address created');
            // 🌍 i18n
            return response.created({ message: t('address.createdSuccess'), address: user_address }); // Nouvelle clé

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user?.id, error: error.message, stack: error.stack }, 'Failed to create user address');
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
            }
            // 🌍 i18n
            return response.internalServerError({ message: t('address.creationFailed'), error: error.message }); // Nouvelle clé
        }
    }

    async get_user_address({ request, response, auth }: HttpContext) {
        // 🔐 Authentification (requise pour voir SES adresses)
        await auth.authenticate();
        const user = auth.user!;

        let payload: Infer<typeof this.getAddressSchema>;
        try {
            // ✅ Validation Vine pour Query Params
            payload = await this.getAddressSchema.validate(request.qs());
        } catch (error) {
             if (error.code === 'E_VALIDATION_ERROR') {
                  // 🌍 i18n
                  return response.badRequest({ message: t('validationFailed'), errors: error.messages });
             }
             throw error;
        }

        try {
             // --- Logique métier ---
            const query = UserAddress.query().where('user_id', user.id); // Filtrer par l'utilisateur

            // 🔍 GET par ID
            if (payload.id) {
                const address = await query.where('id', payload.id).first(); // Utiliser .first()
                if (!address) {
                     // 🌍 i18n
                     return response.notFound({ message: t('address.notFound') }); // Nouvelle clé
                }
                return response.ok(address); // Retourner l'objet unique
            } else {
                // Retourner toutes les adresses de l'utilisateur
                const userAddresses = await query.orderBy('created_at', 'desc'); // Tri par défaut
                return response.ok(userAddresses);
            }
        } catch (error) {
            logger.error({ userId: user.id, addressId: payload?.id, error: error.message, stack: error.stack }, 'Failed to get user address(es)');
            // 🌍 i18n
            return response.internalServerError({ message: t('address.fetchFailed'), error: error.message }); // Nouvelle clé
        }
    }

    async update_user_address({ request, response , auth }: HttpContext) {
        // 🔐 Authentification
        await auth.authenticate();
        const user = auth.user!;

        let payload: Infer<typeof this.updateAddressSchema> = {} as any
        try {
            // ✅ Validation Vine (Body)
            payload = await this.updateAddressSchema.validate(request.body());

            // --- Logique métier ---
            const user_address = await UserAddress.find(payload.id); // Utiliser payload.id

            if (!user_address) {
                // 🌍 i18n
                return response.notFound({ message: t('address.notFound') });
            }

            // Vérifier que l'adresse appartient à l'utilisateur authentifié
            if (user_address.user_id !== user.id) {
                // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') });
            }

            user_address.merge({
                name: payload.name, // merge gère undefined
                longitude: payload.longitude,
                latitude: payload.latitude,
            });
            await user_address.save();

            logger.info({ userId: user.id, addressId: user_address.id }, 'User address updated');
             // 🌍 i18n
            return response.ok({ message: t('address.updateSuccess'), address: user_address }); // Nouvelle clé

        } catch (error) {
            logger.error({ userId: user.id, addressId: payload?.id, error: error.message, stack: error.stack }, 'Failed to update user address');
            if (error.code === 'E_VALIDATION_ERROR') {
                 // 🌍 i18n
                 return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
            }
            // 🌍 i18n
            return response.internalServerError({ message: t('address.updateFailed'), error: error.message }); // Nouvelle clé
        }
    }

    async delete_user_address({ params, response , auth }: HttpContext) { // Modifier pour utiliser params
        // 🔐 Authentification
        await auth.authenticate();
        const user = auth.user!;

        let payload: Infer<typeof this.deleteAddressParamsSchema>;
        try {
            // ✅ Validation Vine pour Params
            payload = await this.deleteAddressParamsSchema.validate(params);
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: t('validationFailed'), errors: error.messages });
            }
            throw error;
        }

        const user_address_id = payload.id; // Utiliser l'ID validé

        try {
            // --- Logique métier ---
            const address = await UserAddress.find(user_address_id);

            if (!address) {
                // 🌍 i18n
                return response.notFound({ message: t('address.notFound') });
            }

            // Vérifier que l'adresse appartient à l'utilisateur authentifié
            if (address.user_id !== user.id) {
                // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') });
            }

            await address.delete();
            logger.info({ userId: user.id, addressId: user_address_id }, 'User address deleted');
            // 🌍 i18n
            // Retourner 204 No Content pour DELETE succès
            return response.noContent(); // Changé de response.ok()

        } catch (error) {
            logger.error({ userId: user.id, addressId: user_address_id, error: error.message, stack: error.stack }, 'Failed to delete user address');
            // 🌍 i18n
            return response.internalServerError({ message: t('address.deleteFailed'), error: error.message }); // Nouvelle clé
        }
    }
}