// app/controllers/roles_controller.ts

import type { HttpContext } from '@adonisjs/core/http'
import Role, { JsonRole, TypeJsonRole } from '#models/role'
import User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { v4 as uuidv4 } from 'uuid'
import vine from '@vinejs/vine'
import logger from '@adonisjs/core/services/logger'
import { t } from '../utils/functions.js'; // ✅ Ajout de t
import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import BullMQService from '#services/BullMQService'
import AsyncConfirm, { AsyncConfirmType } from '#models/asyncConfirm'
import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { securityService } from '#services/SecurityService'

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
            full_name: vine.string().trim().minLength(2).maxLength(255).optional(),
            dashboard_url: vine.string().trim().minLength(3).maxLength(255),
            setup_account_url: vine.string().trim().minLength(2).maxLength(255).optional(),
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

    // --- Controller Methods ---

    async create_collaborator({ request, response, auth }: HttpContext) {
        // 🔐 Authentification et 🛡️ Autorisation gérées par middleware sur la route
        const owner = await securityService.authenticate({ request, auth }); // L'owner qui effectue l'action

        const trx = await db.transaction(); // Transaction pour opérations multiples
        let payload: Infer<typeof this.createCollaboratorSchema>;
        try {
            // ✅ Validation Vine
            payload = await this.createCollaboratorSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
            }
            // Logguer erreur inattendue de validation
            logger.error({ error }, "Unexpected validation error in create_collaborator");
            return response.internalServerError({ message: t('error_occurred') });
        }

        const { email, full_name, dashboard_url, setup_account_url } = payload;

        try {
            // 1. Vérifier si l'email correspond à l'Owner
            if (email === owner.email) {
                await trx.rollback();
                return response.conflict({ message: t('collaborator.cannotAddOwner') });
            }

            // 2. Chercher l'utilisateur existant par email
            const existingUser = await User.query({ client: trx })
                .where('email', email)
                .preload('roles')
                .first();

            // --- Cas 1: Utilisateur Existant ---
            if (existingUser) {
                logger.info({ email, userId: existingUser.id }, "Attempting to add existing user as collaborator");
                // Vérifier s'il est déjà collaborateur (a une entrée dans Role)
                // Note: Avec la structure actuelle, un user a un seul Role.
                if (existingUser.roles && existingUser.roles.length > 0) {
                    await trx.rollback();
                    logger.warn({ email, userId: existingUser.id }, "User is already a collaborator");
                    return response.conflict({ message: t('collaborator.alreadyCollaborator') });
                }

                // Ajouter comme collaborateur (si c'était un client ou autre rôle non-collabo)
                existingUser.useTransaction(trx);
                // existingUser.role_type = RoleType.COLLABORATOR; // Mettre à jour son rôle global
                await existingUser.save();

                const defaultPermissions = Object.keys(JsonRole).reduce((acc, key) => {
                    acc[key as keyof TypeJsonRole] = false; return acc;
                }, {} as Partial<Role>);

                const newRole = await Role.create({
                    id: uuidv4(),
                    user_id: existingUser.id,
                    ...defaultPermissions,
                }, { client: trx });

                await trx.commit(); // Commit après ajout réussi

                // Envoyer Email de Notification à l'utilisateur existant
                try {
                    const queue = BullMQService.getServerToServerQueue();
                    const storeName = env.get('STORE_NAME', 'Votre Boutique'); // Récupérer nom du store
                    await queue.add('send_email', {
                        event: 'send_email',
                        data: {
                            to: existingUser.email,
                            subject: t('emails.collaboratorAddedSubject', { storeName }), // Nouvelle clé
                            template: 'emails/collaborator_added_notification', // Nouveau template
                            context: {
                                userName: existingUser.full_name,
                                storeName: storeName,
                                inviterName: owner.full_name,
                                dashboardUrl: dashboard_url
                            }
                        }
                    }, { jobId: `collab-added-${existingUser.id}-${Date.now()}` });
                    logger.info({ userId: existingUser.id }, "Collaborator added notification job sent");
                } catch (queueError) {
                    logger.error({ userId: existingUser.id, error: queueError.message }, 'Failed to send collaborator added notification job');
                    // Continuer même si l'email échoue
                }


                await newRole.load('user'); // Charger user pour la réponse
                return response.created({ message: t('collaborator.addedSuccessExisting', { email }), role: newRole }); // Nouvelle clé

                // --- Cas 2: Nouvel Utilisateur ---
            } else {
                logger.info({ email, name: full_name }, "Inviting new user as collaborator");

                // a. Créer le nouvel utilisateur
                const tempPassword = uuidv4(); // Mot de passe temporaire fort
                const newUser = await User.create({
                    id: uuidv4(),
                    email: email,
                    full_name: full_name?.trim() || email.substring(0, email.indexOf('@')), // Nom fourni ou défaut
                    password: tempPassword, // Sera hashé par le hook
                    email_verified_at: null, // Non vérifié au début
                    // role_type: RoleType.COLLABORATOR, // Directement collaborateur
                }, { client: trx });
                logger.info({ userId: newUser.id, email }, "New user created for collaboration");

                // b. Créer son rôle avec permissions par défaut
                const defaultPermissions = Object.keys(JsonRole).reduce((acc, key) => {
                    acc[key as keyof TypeJsonRole] = false; return acc;
                }, {} as Partial<Role>);
                const newRole = await Role.create({
                    id: uuidv4(),
                    user_id: newUser.id,
                    ...defaultPermissions,
                }, { client: trx });

                // c. Invalider anciens tokens de setup (sécurité)
                await AsyncConfirm.query({ client: trx })
                    .where('userId', newUser.id)
                    .where('type', AsyncConfirmType.ACCOUNT_SETUP)
                    .update({ usedAt: DateTime.now() });

                // d. Générer et stocker le token de setup
                const tokenBrut = uuidv4() + uuidv4(); // + sécurisé que random
                const tokenHash = await hash.make(tokenBrut);
                const expiresAt = DateTime.now().plus({ days: 2 }); // Durée de vie 48h

                await AsyncConfirm.create({
                    userId: newUser.id,
                    tokenHash: tokenHash,
                    type: AsyncConfirmType.ACCOUNT_SETUP, // Nouveau type
                    expiresAt: expiresAt,
                }, { client: trx });
                logger.info({ userId: newUser.id }, "Account setup token created");

                // e. Construire l'URL de setup pour le frontend
                const setupUrl = `${setup_account_url || dashboard_url}/${setup_account_url ? '' : 'setup-account'}?token=${tokenBrut}`; // Token BRUT dans l'URL

                await trx.commit(); // Commit après création user/role/token

                // f. Envoyer l'email d'invitation/setup via BullMQ
                try {
                    const queue = BullMQService.getServerToServerQueue();
                    const storeName = env.get('STORE_NAME', 'Votre Boutique');
                    await queue.add('send_email', {
                        event: 'send_email',
                        data: {
                            to: newUser.email,
                            subject: t('emails.collaboratorInviteSubject', { storeName }), // Nouvelle clé
                            template: 'emails/collaborator_invitation_setup', // Nouveau template
                            context: {
                                invitedUserName: newUser.full_name, // Nom de l'invité
                                storeName: storeName,
                                inviterName: owner.full_name, // Nom de l'owner
                                setupUrl: setupUrl // Lien pour définir le mot de passe
                            }
                        }
                    }, { jobId: `collab-invite-${newUser.id}-${Date.now()}` });
                    logger.info({ userId: newUser.id }, "Collaborator invitation email job sent");
                } catch (queueError) {
                    logger.error({ userId: newUser.id, error: queueError.message }, 'Failed to send collaborator invitation email job');
                    // Peut-être informer l'owner? Pour S0, on logue juste.
                }

                await newRole.load('user'); // Charger user pour réponse (même si mdp temporaire)
                // 🌍 i18n
                // On retourne le rôle créé, mais le message indique une invitation envoyée
                return response.created({ message: t('collaborator.invitedSuccessNew', { email }), role: newRole }); // Nouvelle clé

            }

        } catch (error) {
            await trx.rollback();
            // Gérer les erreurs spécifiques si nécessaire (ex: contrainte unique email déjà gérée par la logique)
            logger.error({ actorId: owner.id, email, error: error.message, stack: error.stack }, 'Failed to create/invite collaborator');
            // 🌍 i18n
            return response.internalServerError({ message: t('collaborator.creationInviteFailed'), error: error.message }); // Nouvelle clé générique
        }
    }

    async add_remove_permission({ request, response, auth }: HttpContext) {
        // 🔐 Authentification
        await securityService.authenticate({ request, auth });
        // 🛡️ Permissions
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [MANAGE_COLLABORATORS_PERMISSION]);
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') });
            }
            throw error;
        }

        const trx = await db.transaction();
        let payload: Infer<typeof this.updatePermissionsSchema> = {} as any;
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

    async list_role({ response, auth, request }: HttpContext) {
        // 🔐 Authentification
        await securityService.authenticate({ request, auth });
        // 🛡️ Permissions
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [VIEW_COLLABORATORS_PERMISSION]);
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
                list: collaborators.all(),
                meta: collaborators.getMeta()
            });

        } catch (error) {
            logger.error({ actorId: auth.user!.id, error: error.message, stack: error.stack }, 'Failed to list collaborators');
            // 🌍 i18n
            return response.internalServerError({ message: t('collaborator.listFailed'), error: error.message }); // Nouvelle clé
        }
    }

    async remove_collaborator({ params, response, request, auth }: HttpContext) {
        // 🔐 Authentification
        await securityService.authenticate({ request, auth });
        // 🛡️ Permissions
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [MANAGE_COLLABORATORS_PERMISSION]);
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

            // await User.find(collaboratorUserId, { client: trx });

            await role.useTransaction(trx).delete();

            // Remettre le rôle à CLIENT si l'utilisateur existe
            // if (user && user.role_type === RoleType.COLLABORATOR) {
            //     user.useTransaction(trx);
            //     user.role_type = RoleType.CLIENT;
            //     await user.save();
            // } else if (user) {
            //     logger.warn({ collaboratorId: collaboratorUserId, currentRole: user.role_type }, "User found but was not marked as collaborator during removal");
            // }

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