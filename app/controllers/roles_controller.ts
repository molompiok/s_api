// app/controllers/roles_controller.ts

import type { HttpContext } from '@adonisjs/core/http'
import Role, { JsonRole, TypeJsonRole } from '#models/role'
import User, { RoleType } from '#models/user'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { v4 as uuidv4 } from 'uuid'
import vine from '@vinejs/vine'
import logger from '@adonisjs/core/services/logger'
import { t } from '../utils/functions.js'; // ✅ Ajout de t
import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer

// Permission requise pour gérer les collaborateurs (ajouter, modifier perms, supprimer)
const MANAGE_COLLABORATORS_PERMISSION: keyof TypeJsonRole = 'create_delete_collaborator';
// Permission requise pour lister les collaborateurs
const VIEW_COLLABORATORS_PERMISSION: keyof TypeJsonRole = 'filter_collaborator';

export default class RolesController {
  private OWNER_ID = env.get('OWNER_ID');

  // --- Input Validation Schemas ---
  private createCollaboratorSchema = vine.compile(
    vine.object({
      email: vine.string().trim().email().normalizeEmail(),
    })
  );

  // Schéma dynamique pour les permissions (utilisé dans updatePermissionsSchema)
  private permissionsSchema = vine.object(
    Object.keys(JsonRole).reduce((acc: any, key: any) => {
      acc[key] = vine.boolean().optional();
      return acc;
    }, {} as Record<keyof TypeJsonRole, any>) // Type assertion
  );

  private updatePermissionsSchema = vine.compile(
    vine.object({
      collaborator_user_id: vine.string().uuid(),
      permissions: this.permissionsSchema,
    })
  );

  private listRoleSchema = vine.compile(
      vine.object({
          page: vine.number().positive().optional(),
          limit: vine.number().positive().optional(),
      })
  );

   private removeCollaboratorParamsSchema = vine.compile(
       vine.object({
           id: vine.string().uuid(), // ID du collaborateur dans l'URL
       })
   );

  /**
   * Méthode privée pour vérifier si l'utilisateur est Owner.
   * Remplacée par l'utilisation directe de Bouncer OU une vérification simplifiée.
   * Pour S0, on peut garder la vérification directe si Bouncer n'est pas utilisé ici,
   * mais l'idéal serait d'utiliser Bouncer partout.
   * Note: `ensureIsOwner` lançait une erreur, ce qui n'est pas idéal pour la traduction.
   * On va plutôt intégrer la logique dans les méthodes avec Bouncer.
   */
  // private async ensureIsOwner(auth: HttpContext['auth']) { ... } // Remplacé par Bouncer

  // --- Controller Methods ---

  async create_collaborator({ request, response, auth, bouncer }: HttpContext) {
    // 🔐 Authentification
    await auth.authenticate();
    // 🛡️ Permissions (Seul Owner ou un collaborateur avec la permission peut en créer un autre)
    try {
        await bouncer.authorize('collaboratorAbility', [MANAGE_COLLABORATORS_PERMISSION]);
    } catch (error) {
        if (error.code === 'E_AUTHORIZATION_FAILURE') {
             // 🌍 i18n
             return response.forbidden({ message: t('unauthorized_action') });
        }
        throw error;
    }

    const trx = await db.transaction();
    let payload: Infer<typeof this.createCollaboratorSchema>={} as any;
    try {
        // ✅ Validation Vine
        payload = await this.createCollaboratorSchema.validate(request.body());
        const email = payload.email; // Utiliser l'email validé

        // --- Logique métier ---
        const targetUser = await User.findBy('email', email, { client: trx });
        if (!targetUser) {
            await trx.rollback();
             // 🌍 i18n
             return response.notFound({ message: t('collaborator.userNotFound', { email }) }); // Nouvelle clé
        }

        if (targetUser.id === this.OWNER_ID) {
            await trx.rollback();
            // 🌍 i18n
            return response.conflict({ message: t('collaborator.cannotAddOwner') }); // Nouvelle clé
        }
        const existingRole = await Role.findBy('user_id', targetUser.id, { client: trx });
        if (existingRole) {
            await trx.rollback();
            // 🌍 i18n
            return response.conflict({ message: t('collaborator.alreadyCollaborator') }); // Nouvelle clé
        }

        // targetUser.useTransaction(trx);
        // targetUser.role_type = RoleType.COLLABORATOR;
        // await targetUser.save();

        const defaultPermissions = Object.keys(JsonRole).reduce((acc, key) => {
            acc[key as keyof TypeJsonRole] = false;
            return acc;
        }, {} as Partial<Role>);

        const newRole = await Role.create(
            {
                id: uuidv4(),
                user_id: targetUser.id,
                ...defaultPermissions,
            },
            { client: trx }
        );

        await trx.commit();
        logger.info({ actorId: auth.user!.id, collaboratorId: targetUser.id }, 'Collaborator created');

        await newRole.load('user'); // Charger l'utilisateur pour la réponse

        // 🌍 i18n
        return response.created({ message: t('collaborator.createdSuccess'), role: newRole }); // Nouvelle clé

    } catch (error) {
        await trx.rollback();
        logger.error({ actorId: auth.user?.id, email: payload?.email, error: error.message, stack: error.stack }, 'Failed to create collaborator');
        if (error.code === 'E_VALIDATION_ERROR') {
             // 🌍 i18n
            return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
        }
        // 🌍 i18n
        return response.internalServerError({ message: t('collaborator.creationFailed'), error: error.message }); // Nouvelle clé
    }
  }

  async add_remove_permission({ request, response, auth, bouncer }: HttpContext) {
     // 🔐 Authentification
     await auth.authenticate();
     // 🛡️ Permissions
     try {
         await bouncer.authorize('collaboratorAbility', [MANAGE_COLLABORATORS_PERMISSION]);
     } catch (error) {
         if (error.code === 'E_AUTHORIZATION_FAILURE') {
             // 🌍 i18n
             return response.forbidden({ message: t('unauthorized_action') });
         }
         throw error;
     }

    const trx = await db.transaction();
    let payload: Infer<typeof this.updatePermissionsSchema>={} as any;
    try {
        // ✅ Validation Vine
        payload = await this.updatePermissionsSchema.validate(request.body());
        const { collaborator_user_id, permissions } = payload;

        // --- Logique métier ---
        if (collaborator_user_id === this.OWNER_ID) {
            await trx.rollback();
            // 🌍 i18n
            return response.badRequest({ message: t('collaborator.cannotEditOwnerPerms') }); // Nouvelle clé
        }

        const role = await Role.query({ client: trx }).where('user_id', collaborator_user_id).first(); // Utiliser first()
        if (!role) {
            await trx.rollback();
            // 🌍 i18n
            return response.notFound({ message: t('collaborator.notFound') }); // Nouvelle clé
        }

        role.useTransaction(trx);
        role.merge(permissions);
        await role.save();

        await trx.commit();
        logger.info({ actorId: auth.user!.id, collaboratorId: collaborator_user_id, permissions }, 'Collaborator permissions updated');

        await role.load('user');

         // 🌍 i18n
        return response.ok({ message: t('collaborator.permsUpdateSuccess'), role: role }); // Nouvelle clé

    } catch (error) {
        await trx.rollback();
        logger.error({ actorId: auth.user?.id, targetUserId: payload?.collaborator_user_id, error: error.message, stack: error.stack }, 'Failed to update permissions');
        if (error.code === 'E_VALIDATION_ERROR') {
            // 🌍 i18n
            return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
        }
        // 🌍 i18n
        return response.internalServerError({ message: t('collaborator.permsUpdateFailed'), error: error.message }); // Nouvelle clé
    }
  }

  async list_role({ response, auth, request, bouncer }: HttpContext) {
      // 🔐 Authentification
      await auth.authenticate();
      // 🛡️ Permissions
      try {
          await bouncer.authorize('collaboratorAbility', [VIEW_COLLABORATORS_PERMISSION]);
      } catch (error) {
          if (error.code === 'E_AUTHORIZATION_FAILURE') {
               // 🌍 i18n
              return response.forbidden({ message: t('unauthorized_action') });
          }
          throw error;
      }

    let payload: Infer<typeof this.listRoleSchema>;
    try {
        // ✅ Validation Vine pour Query Params
        payload = await this.listRoleSchema.validate(request.qs());
    } catch (error) {
        if (error.code === 'E_VALIDATION_ERROR') {
            // 🌍 i18n
            return response.badRequest({ message: t('validationFailed'), errors: error.messages })
        }
        throw error;
    }

    try {
        // --- Logique métier ---
        const page = payload.page ?? 1;
        const limit = payload.limit ?? 15;

        const collaborators = await Role.query()
            .whereNot('user_id', this.OWNER_ID) // Exclure le propriétaire
            .preload('user') // Charger les détails de l'utilisateur associé
            .orderBy('created_at', 'desc')
            .paginate(page, limit);

        // Pas de message i18n car on retourne la liste directement
        return response.ok({
            list:collaborators.all(),
            meta:collaborators.getMeta()
        });

    } catch (error) {
        logger.error({ actorId: auth.user!.id, error: error.message, stack: error.stack }, 'Failed to list collaborators');
        // 🌍 i18n
        return response.internalServerError({ message: t('collaborator.listFailed'), error: error.message }); // Nouvelle clé
    }
  }

  async remove_collaborator({ params, response, auth, bouncer }: HttpContext) {
     // 🔐 Authentification
     await auth.authenticate();
      // 🛡️ Permissions
      try {
          await bouncer.authorize('collaboratorAbility', [MANAGE_COLLABORATORS_PERMISSION]);
      } catch (error) {
          if (error.code === 'E_AUTHORIZATION_FAILURE') {
               // 🌍 i18n
              return response.forbidden({ message: t('unauthorized_action') });
          }
          throw error;
      }

    let payload: Infer<typeof this.removeCollaboratorParamsSchema>;
    try {
        // ✅ Validation Vine pour Params
        payload = await this.removeCollaboratorParamsSchema.validate(params);
    } catch (error) {
        if (error.code === 'E_VALIDATION_ERROR') {
            // 🌍 i18n
            return response.badRequest({ message: t('validationFailed'), errors: error.messages });
        }
        throw error;
    }

    const collaboratorUserId = payload.id; // ID validé

    // --- Logique métier ---
    if (collaboratorUserId === this.OWNER_ID) {
        // 🌍 i18n
        return response.badRequest({ message: t('collaborator.cannotRemoveOwner') }); // Nouvelle clé
    }

    const trx = await db.transaction();
    try {
        const role = await Role.query({ client: trx }).where('user_id', collaboratorUserId).first(); // Utiliser first()
        if (!role) {
            await trx.rollback();
            // 🌍 i18n
            return response.notFound({ message: t('collaborator.notFound') });
        }

        const user = await User.find(collaboratorUserId, { client: trx });

        await role.useTransaction(trx).delete();

        // Remettre le rôle à CLIENT si l'utilisateur existe
        if (user && user.role_type === RoleType.COLLABORATOR) {
            user.useTransaction(trx);
            user.role_type = RoleType.CLIENT;
            await user.save();
        } else if (user) {
             logger.warn({ collaboratorId: collaboratorUserId, currentRole: user.role_type }, "User found but was not marked as collaborator during removal");
        }

        await trx.commit();
        logger.info({ actorId: auth.user!.id, collaboratorId: collaboratorUserId }, 'Collaborator removed');

        // 🌍 i18n
        return response.ok({ message: t('collaborator.removeSuccess'), isDeleted: true }); // Nouvelle clé

    } catch (error) {
        await trx.rollback();
        logger.error({ actorId: auth.user!.id, collaboratorId: collaboratorUserId, error: error.message, stack: error.stack }, 'Failed to remove collaborator');
        // 🌍 i18n
        return response.internalServerError({ message: t('collaborator.removeFailed'), error: error.message }); // Nouvelle clé
    }
  }
}