import UserPhone from '#models/user_phone'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { v4 } from 'uuid'
import vine from '@vinejs/vine'; // ✅ Ajout de Vine
import { t } from '../utils/functions.js'; // ✅ Ajout de t
import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import logger from '@adonisjs/core/services/logger'; // Ajout pour logs
import { securityService } from '#services/SecurityService';
// Pas besoin de   actions liées à l'utilisateur lui-même

export default class UserPhonesController {

  // --- Schémas de validation Vine ---
  private createPhoneSchema = vine.compile(
    vine.object({
      phone_number: vine.string().trim().minLength(5).maxLength(20), // Ajuster si besoin
      format: vine.string().trim().maxLength(50).optional(), // Ex: "+XXX XX XXX XXXX"
      country_code: vine.string().trim().maxLength(10).optional(), // Ex: "ci", "fr", "+225"
    })
  );

  private getPhonesSchema = vine.compile(
    vine.object({
      // user_id est implicite via l'authentification
      id: vine.string().uuid().optional(), // ID du téléphone spécifique (query param)
    })
  );

  private updatePhoneSchema = vine.compile(
    vine.object({
      id: vine.string().uuid(), // ID du téléphone à MAJ (dans le body)
      phone_number: vine.string().trim().minLength(5).maxLength(20).optional(),
      format: vine.string().trim().maxLength(50).optional(),
      country_code: vine.string().trim().maxLength(10).optional(),
    })
  );

  private deletePhoneParamsSchema = vine.compile(
    vine.object({
      id: vine.string().uuid(), // ID du téléphone dans l'URL
    })
  );

  // --- Méthodes du contrôleur ---

  async create_user_phone({ request, response, auth }: HttpContext) {
    // 🔐 Authentification
    await securityService.authenticate({ request, auth });
    const user = auth.user!;

    const id = v4();
    const trx = await db.transaction();
    let payload: Infer<typeof this.createPhoneSchema>;
    try {
      // ✅ Validation Vine (Body)
      payload = await this.createPhoneSchema.validate(request.body());

      // --- Logique métier ---
      const user_phone = await UserPhone.create({
        id,
        user_id: user.id, // Lier à l'utilisateur authentifié
        phone_number: payload.phone_number,
        format: payload.format,
        country_code: payload.country_code,
      }, { client: trx });

      await trx.commit();
      logger.info({ userId: user.id, phoneId: user_phone.id }, 'User phone created');
      // 🌍 i18n
      return response.created({ message: t('phone.createdSuccess'), phone: user_phone }); // Nouvelle clé

    } catch (error) {
      await trx.rollback();
      logger.error({ userId: user?.id, error: error.message, stack: error.stack }, 'Failed to create user phone');
      if (error.code === 'E_VALIDATION_ERROR') {
        // 🌍 i18n
        return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
      }
      // 🌍 i18n
      return response.internalServerError({ message: t('phone.creationFailed'), error: error.message }); // Nouvelle clé
    }
  }

  async get_user_phones({ request, response, auth }: HttpContext) { // Renommé pour la clarté
    // 🔐 Authentification
    await securityService.authenticate({ request, auth });
    const user = auth.user!;

    let payload: Infer<typeof this.getPhonesSchema>;
    try {
      // ✅ Validation Vine pour Query Params
      payload = await this.getPhonesSchema.validate(request.qs());
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        // 🌍 i18n
        return response.badRequest({ message: t('validationFailed'), errors: error.messages });
      }
      throw error;
    }

    try {
      // --- Logique métier ---
      const query = UserPhone.query().where('user_id', user.id);

      // 🔍 GET par ID
      if (payload.id) {
        query.where('id', payload.id).limit(1)
      } else {
        // Lister tous les numéros de l'utilisateur
        const user_phones = await query.orderBy('created_at', 'desc');
        return response.ok(user_phones);
      }
    } catch (error) {
      logger.error({ userId: user.id, phoneId: payload?.id, error: error.message, stack: error.stack }, 'Failed to get user phone(s)');
      // 🌍 i18n
      return response.internalServerError({ message: t('phone.fetchFailed'), error: error.message }); // Nouvelle clé
    }
  }

  async update_user_phone({ request, response, auth }: HttpContext) {
    // 🔐 Authentification
    await securityService.authenticate({ request, auth });
    const user = auth.user!;

    const id = request.param('id');

    if (!id) {
        return response.badRequest({ message: 'Phone ID is required' });
    }

    let payload: Infer<typeof this.updatePhoneSchema> = {} as any;
    // Pas besoin de transaction pour une simple mise à jour d'un enregistrement
    try {
      // ✅ Validation Vine (Body)
      payload = await this.updatePhoneSchema.validate(request.body());

      // --- Logique métier ---
      const user_phone = await UserPhone.find(id); // Utiliser payload.id

      console.log({lodksodkoskdo :user_phone});
      

      if (!user_phone) {
        // 🌍 i18n
        return response.notFound({ message: t('phone.notFound') });
      }

      // Vérifier l'appartenance
      if (user_phone.user_id !== user.id) {
        // 🌍 i18n
        return response.forbidden({ message: t('unauthorized_action') });
      }

      user_phone.merge({
        phone_number: payload.phone_number,
        format: payload.format,
        country_code: payload.country_code,
      });
      await user_phone.save();

      logger.info({ userId: user.id, phoneId: user_phone.id }, 'User phone updated');
      // 🌍 i18n
      return response.ok({ message: t('phone.updateSuccess'), phone: user_phone }); // Nouvelle clé

    } catch (error) {
      logger.error({ userId: user.id, phoneId: payload?.id, error: error.message, stack: error.stack }, 'Failed to update user phone');
      if (error.code === 'E_VALIDATION_ERROR') {
        // 🌍 i18n
        return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
      }
      // 🌍 i18n
      return response.internalServerError({ message: t('phone.updateFailed'), error: error.message }); // Nouvelle clé
    }
  }

  async delete_user_phone({ params, response, request, auth }: HttpContext) {
    // 🔐 Authentification
    await securityService.authenticate({ request, auth });
    const user = auth.user!;

    let payload: Infer<typeof this.deletePhoneParamsSchema>;
    try {
      // ✅ Validation Vine pour Params
      payload = await this.deletePhoneParamsSchema.validate(params);
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        // 🌍 i18n
        return response.badRequest({ message: t('validationFailed'), errors: error.messages });
      }
      throw error;
    }

    const id = payload.id; // ID validé

    try {
      // --- Logique métier ---
      const user_phone = await UserPhone.find(id);

      if (!user_phone) {
        // 🌍 i18n
        return response.notFound({ message: t('phone.notFound') });
      }

      if (user_phone.user_id !== user.id) {
        // 🌍 i18n
        return response.forbidden({ message: t('unauthorized_action') });
      }

      await user_phone.delete();
      logger.info({ userId: user.id, phoneId: id }, 'User phone deleted');

      // 🌍 i18n (Retourner 204 No Content)
      return response.noContent();

    } catch (error) {
      logger.error({ userId: user.id, phoneId: id, error: error.message, stack: error.stack }, 'Failed to delete user phone');
      // 🌍 i18n
      return response.internalServerError({ message: t('phone.deleteFailed'), error: error.message }); // Nouvelle clé
    }
  }
}