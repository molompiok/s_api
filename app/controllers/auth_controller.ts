import hash from '@adonisjs/core/services/hash';
import User from '#models/user'
import { type HttpContext } from '@adonisjs/core/http'
import { v4 as uuidv4 } from 'uuid';
import vine from '@vinejs/vine';
import { DateTime } from 'luxon';
import string from '@adonisjs/core/helpers/string';
import EmailVerificationToken from '#models/email_verification_token';
import BullMQService from '#services/BullMQService';
import env from '#start/env';
import logger from '@adonisjs/core/services/logger';
import { AccessToken } from '@adonisjs/auth/access_tokens';
import { SecurityService } from '#services/SecurityService';
import { t } from '../utils/functions.js'; // ✅ Ajout de t
import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import db from '@adonisjs/lucid/services/db';
import UserAuthentification from '#models/user_authentification';
// Bouncer n'est pas utilisé directement ici, les actions sont liées à l'utilisateur lui-même

// Interface spécifique pour delete_account
interface UserWithToken extends User {
    currentAccessToken: AccessToken // AccessToken doit être importé
}

export default class AuthController {

    // --- Schémas de validation Vine ---
    private socialCallbackSchema = vine.compile(
        vine.object({
            provider: vine.string().trim().minLength(1),
            providerId: vine.string().trim().minLength(1),
            email: vine.string().trim().email().normalizeEmail(),
            fullName: vine.string().trim().optional(),
            avatarUrl: vine.string().url().optional()
        })
    );

    private loginSchema = vine.compile(
        vine.object({
            email: vine.string().trim().email().normalizeEmail(), // Normaliser à la validation
            password: vine.string()
        })
    );

    private registerSchema = vine.compile(
        vine.object({
            full_name: vine.string().trim().minLength(3).maxLength(255),
            email: vine.string().trim().email().normalizeEmail(),
            password: vine.string().minLength(8).confirmed(), // Doit avoir password_confirmation dans la requête
        })
    );

    private resendSchema = vine.compile(
        vine.object({
            email: vine.string().trim().email().normalizeEmail(),
        })
    );

    private verifyEmailSchema = vine.compile(
        vine.object({
            token: vine.string().trim().minLength(10), // Token requis
        })
    );

    private updateUserSchema = vine.compile(
        vine.object({
            full_name: vine.string().trim().minLength(3).maxLength(255).optional(),
            // Le mot de passe nécessite confirmation
            password: vine.string().minLength(8).confirmed().optional(),
        })
    );

    // --- Méthodes du contrôleur ---

    // Endpoint interne, pas besoin de traduction pour les erreurs internes.
    // La validation Vine renvoie déjà des messages d'erreur standard.
    async handleSocialCallbackInternal({ request, response }: HttpContext) {
        // Middleware InternalApiAuthMiddleware gère la sécurité
        new SecurityService().verifyInternalRequest(request);

        let socialData: Infer<typeof this.socialCallbackSchema>;
        try {
            // ✅ Validation Vine
            socialData = await this.socialCallbackSchema.validate(request.body());
        } catch (error) {
            logger.warn({ validationErrors: error.messages, body: request.body() }, 'Validation failed for internal social callback');
            return response.unprocessableEntity(error.messages); // Garder erreur Vine standard
        }

        logger.info({ provider: socialData.provider, email: socialData.email }, 'Processing internal social callback');
        const trx = await db.transaction(); // Utiliser une transaction pour création/liaison

        try {
            let user: User;
            let isNewUser = false;
            let needsLinking = false;

            // Recherche user/auth (logique métier inchangée)
            const authEntry = await UserAuthentification.query({ client: trx })
                .where('provider', socialData.provider)
                .where('provider_id', socialData.providerId)
                .preload('user')
                .first();

            if (authEntry?.user) {
                user = authEntry.user;
                logger.info({ userId: user.id, provider: socialData.provider }, 'Existing user found via social provider ID');
            } else {
                const userByEmail = await User.findBy('email', socialData.email, { client: trx });

                if (userByEmail) {
                    user = userByEmail;
                    needsLinking = true;
                    logger.info({ userId: user.id, email: user.email }, 'Existing user found via email, linking social provider');
                    if (!user.isEmailVerified) {
                        user.email_verified_at = DateTime.now();
                        await user.useTransaction(trx).save(); // Sauver dans la transaction
                        logger.info({ userId: user.id }, 'Email marked as verified via social login');
                    }
                } else {
                    isNewUser = true;
                    logger.info({ email: socialData.email, provider: socialData.provider }, 'Creating new user from social login');
                    user = await User.create({
                        id: uuidv4(),
                        full_name: socialData.fullName?.trim() || `Utilisateur_${string.generateRandom(6)}`,
                        email: socialData.email,
                        password: await hash.make(string.random(40)), // Hasher le mot de passe aléatoire
                        email_verified_at: DateTime.now(),
                    }, { client: trx });
                    needsLinking = true;
                }

                if (needsLinking) {
                    await UserAuthentification.create({
                        id: uuidv4(),
                        user_id: user.id,
                        provider: socialData.provider as any, // Assumer provider valide
                        provider_id: socialData.providerId,
                    }, { client: trx });
                    logger.info({ userId: user.id, provider: socialData.provider }, 'Social provider linked to user');
                }
            }

            // Génération Token (logique métier inchangée)
            const token = await User.accessTokens.create(user, ['*'], {
                name: `social_login_${socialData.provider}_${user.id}_${DateTime.now().toMillis()}`,
                expiresIn: '30 days'
            });
            logger.info({ userId: user.id, isNew: isNewUser }, 'API token generated for user');

            await trx.commit(); // Commit si tout va bien

            // Réponse (pas de message i18n car c'est une API interne)
            return response.ok({
                token: token.value!.release(),
                expires_at: token.expiresAt?.toISOString(),
                is_new_user: isNewUser
            });

        } catch (error) {
            await trx.rollback(); // Rollback en cas d'erreur
            logger.error({ provider: socialData.provider, email: socialData.email, error: error.message, stack: error.stack }, 'Failed to handle internal social callback');
            // 🌍 i18n (message générique pour API interne)
            return response.internalServerError({ message: t('auth.socialCallbackFailed') }); // Nouvelle clé
        }
    }

    async login({ request, response }: HttpContext) { // Retiré auth car non utilisé pour login
        let payload: Infer<typeof this.loginSchema>;
        try {
            // ✅ Validation Vine
            payload = await this.loginSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
            }
            throw error; // Relancer autres erreurs
        }

        const { email, password } = payload;

        try {
            // --- Logique métier ---
            const user = await User.verifyCredentials(email, password);

            if (!user.isEmailVerified) {
                logger.warn({ user_id: user.id, email: user.email }, 'Login attempt with unverified email');
                try {
                    // Tenter de renvoyer l'email si non vérifié
                    await this.sendVerificationEmail(user);
                } catch (sendError) {
                    logger.error({ userId: user.id, error: sendError }, "Failed to resend verification email during login attempt");
                }
                // 🌍 i18n
                return response.unauthorized({
                    code: 'E_EMAIL_NOT_VERIFIED',
                    // message: t('auth.emailNotVerified') // Nouvelle clé
                    message: 'Verifier votre boite email' // Nouvelle clé
                });
            }

            const token = await User.accessTokens.create(user, ['*'], {
                name: `api_login_${user.id}_${DateTime.now().toMillis()}`,
                expiresIn: '30 days'
            });

            logger.info({ user_id: user.id }, 'User logged in successfully via API token');

            // 🌍 i18n (message de succès optionnel)
            return response.ok({
                message: t('auth.loginSuccess'), // Nouvelle clé
                user: User.ParseUser(user), // Exclure mot de passe etc.
                token: token.value!.release(),
                expires_at: token.expiresAt?.toISOString()
            });

        } catch (error) {
            if (error.code === 'E_INVALID_CREDENTIALS') {
                logger.warn({ email }, 'Invalid credentials during login');
                // 🌍 i18n
                return response.unauthorized({ message: t('auth.invalidCredentials') }); // Nouvelle clé
            }
            logger.error({ email, error: error.message, stack: error.stack }, 'Login failed');
            // 🌍 i18n
            return response.internalServerError({ message: t('auth.loginFailed'), error: error.message }); // Nouvelle clé
        }
    }


    public async register_mdp({ request, response }: HttpContext) { // Retiré auth
        let payload: Infer<typeof this.registerSchema>;
        try {
            // ✅ Validation Vine
            payload = await this.registerSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
            }
            throw error;
        }

        const trx = await db.transaction(); // Transaction pour création User + Auth entry
        let user: User | null = null;
        try {
            // --- Logique métier ---
            const existingUser = await User.findBy('email', payload.email, { client: trx });
            if (existingUser) {
                logger.warn({ email: payload.email }, 'Registration attempt with existing email');
                await trx.rollback(); // Annuler la transaction
                // 🌍 i18n
                return response.conflict({ message: t('auth.emailConflict') }); // Nouvelle clé
            }

            user = await User.create({
                id: uuidv4(),
                full_name: payload.full_name,
                email: payload.email,
                password: payload.password, // Hashage géré par hook User
            }, { client: trx });
            logger.info({ user_id: user.id, email: user.email }, 'User created');

            await UserAuthentification.create({
                id: uuidv4(),
                user_id: user.id,
                provider: 'email',
                provider_id: user.email, // Utiliser email comme provider_id pour type 'email'
            }, { client: trx });

            await this.sendVerificationEmail(user); // Envoi email (hors transaction DB principale)

            await trx.commit(); // Commit après succès création DB

            // 🌍 i18n
            return response.created({
                message: t('auth.registerSuccess'), // Nouvelle clé
                user_id: user.id
            });

        } catch (error) {
            await trx.rollback(); // Assurer rollback en cas d'erreur (même si sendVerificationEmail échoue après)
            logger.error({ email: payload.email, error: error.message, stack: error.stack }, 'Registration failed');
            // 🌍 i18n
            return response.internalServerError({
                message: t('auth.registerFailed'), // Nouvelle clé
                error: error.message,
            });
        }
    }

    // Méthode privée, pas de traduction nécessaire pour les logs internes
    private async sendVerificationEmail(user: User): Promise<void> {
        // Logique inchangée, mais ajouter un log si l'envoi à BullMQ échoue
        try {
            await EmailVerificationToken.query().where('user_id', user.id).delete();
            const tokenValue = string.random(64);
            const expires_at = DateTime.now().plus({ hours: 24 });
            const verificationToken = await EmailVerificationToken.create({
                user_id: user.id, token: tokenValue, expires_at: expires_at,
            });
            logger.info({ user_id: user.id, tokenId: verificationToken.id }, 'Email verification token created');

            const verificationUrl = `${env.get('APP_URL')}/api/auth/verify-email?token=${tokenValue}`;

            const queue = BullMQService.getServerToServerQueue();
            await queue.add('send_email', {
                event: 'send_email',
                data: {
                    to: user.email, subject: t('emails.verifySubject'), // 🌍 i18n pour le sujet
                    template: 'emails/verify_email',
                    context: { userName: user.full_name, verificationUrl: verificationUrl }
                }
            }, { jobId: `verify-email-${user.id}-${Date.now()}` });
            logger.info({ user_id: user.id, email: user.email }, 'Verification email job sent to s_server');
        } catch (queueError) {
            logger.error({ user_id: user.id, error: queueError.message }, 'Failed to send verification email job');
            // Ne pas relancer l'erreur ici pour ne pas casser l'inscription, mais logguer est important.
            // throw queueError; // Optionnel: si l'email est critique
        }
    }


    async verifyEmail({ request, response }: HttpContext) { // Pas d'auth ici
        let payload: { token: string }; // Type simple pour le token
        try {
            // ✅ Validation Vine (Query Params) - Le token est dans le query string
            payload = await this.verifyEmailSchema.validate(request.qs());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: t('validationFailed'), errors: error.messages });
            }
            throw error;
        }
        const tokenValue = payload.token;

        // --- Logique métier ---
        const verificationToken = await EmailVerificationToken.query()
            .where('token', tokenValue)
            .preload('user')
            .first();

        if (!verificationToken || verificationToken.expires_at < DateTime.now()) {
            logger.warn({ token: tokenValue }, 'Invalid or expired email verification token used');
            // 🌍 i18n
            return response.badRequest({ message: t('auth.invalidOrExpiredToken') }); // Nouvelle clé
        }

        const user = verificationToken.user; // Garanti d'exister car préchargé
        if (!user) {
            // Sécurité : le token existe mais l'utilisateur associé a été supprimé?
            logger.error({ tokenId: verificationToken.id, tokenValue }, "Verification token found but associated user does not exist.");
            await verificationToken.delete(); // Nettoyer le token orphelin
            // 🌍 i18n
            return response.badRequest({ message: t('auth.invalidOrExpiredToken') }); // Message générique
        }


        if (user.isEmailVerified) {
            logger.info({ user_id: user.id }, 'Email already verified');
            await verificationToken.delete();
            // 🌍 i18n
            return response.ok({ message: t('auth.emailAlreadyVerified') }); // Nouvelle clé
        }

        const trx = await db.transaction(); // Transaction pour MAJ user + delete token
        try {
            user.useTransaction(trx);
            user.email_verified_at = DateTime.now();
            await user.save();
            await verificationToken.useTransaction(trx).delete();
            await trx.commit();

            logger.info({ user_id: user.id }, 'Email successfully verified');
            // 🌍 i18n
            return response.ok({ message: t('auth.emailVerificationSuccess') }); // Nouvelle clé

        } catch (error) {
            await trx.rollback();
            logger.error({ user_id: user.id, error: error.message, stack: error.stack }, 'Failed to update user verification status');
            // 🌍 i18n
            return response.internalServerError({ message: t('auth.emailVerificationFailedDb') }); // Nouvelle clé
        }
    }


    async resendVerification({ request, response }: HttpContext) { // Pas d'auth ici
        let payload: Infer<typeof this.resendSchema>;
        try {
            // ✅ Validation Vine (Body)
            payload = await this.resendSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
            }
            throw error;
        }
        const email = payload.email;

        // --- Logique métier ---
        const user = await User.findBy('email', email);

        // Message générique pour la sécurité (ne pas révéler si l'email existe)
        const genericMessage = t('auth.resendGenericResponse'); // Nouvelle clé

        if (!user || user.isEmailVerified) {
            if (!user) {
                logger.info({ email }, 'Resend verification attempt for non-existent email');
            } else {
                logger.info({ user_id: user.id }, 'Resend verification attempt for already verified email');
            }
            return response.ok({ message: genericMessage });
        }

        try {
            await this.sendVerificationEmail(user); // Renvoi l'email
            return response.ok({ message: genericMessage });
        } catch (error) {
            // sendVerificationEmail logue déjà l'erreur interne
            // 🌍 i18n (Message générique même en cas d'erreur interne pour sécurité)
            return response.ok({ message: genericMessage });
            // Ou retourner une erreur 500 si on préfère indiquer un problème serveur
            // return response.internalServerError({ message: t('auth.resendFailedInternal') });
        }
    }


    public async logoutAllDevices({ auth, response, session }: HttpContext) {
        // 🔐 Authentification
        await auth.authenticate();
        const user = auth.user!;

        try {
            // --- Logique métier ---
            const tokens = await User.accessTokens.all(user);
            for (const token of tokens) {
                await User.accessTokens.delete(user, token.identifier);
            }
            session.clear(); // Effacer aussi la session web si existante

            logger.info({ userId: user.id }, "User logged out from all devices");
            // 🌍 i18n
            return response.ok({ message: t('auth.logoutAllSuccess') }); // Nouvelle clé

        } catch (error) {
            logger.error({ userId: user.id, error: error.message, stack: error.stack }, 'Failed to logout from all devices');
            // 🌍 i18n
            return response.internalServerError({ message: t('auth.logoutAllFailed'), error: error.message }); // Nouvelle clé
        }
    }


    public async logout({ auth, response }: HttpContext) {
        // Tenter d'authentifier pour savoir quel guard utiliser (logique métier inchangée)
        let mode: 'api' | 'web' | '' = '';
        let userForLogout: User | (User & { currentAccessToken: AccessToken }) | null = null;
        let tokenIdentifier: string | number | BigInt | undefined = undefined;

        try {
            userForLogout = await auth.use('api').authenticate();
            tokenIdentifier = (userForLogout as User & { currentAccessToken: AccessToken })?.currentAccessToken?.identifier;
            if (userForLogout) mode = 'api';
        } catch { }

        if (!userForLogout) {
            try {
                userForLogout = await auth.use('web').authenticate();
                if (userForLogout) mode = 'web';
            } catch { }
        }

        // Si aucun utilisateur n'est authentifié par aucun guard
        if (!userForLogout) {
            // 🌍 i18n
            return response.unauthorized({ message: t('auth.notAuthenticated') }); // Nouvelle clé
        }

        const userId = userForLogout.id; // ID de l'utilisateur qui se déconnecte
        let logoutError = false;

        // --- Logique métier (avec logs et gestion d'erreur améliorée) ---
        try {
            if (mode === 'api' && tokenIdentifier) {
                await User.accessTokens.delete(userForLogout, tokenIdentifier);
                logger.debug({ userId }, "API token deleted for logout");
            }
        } catch (apiLogoutError) {
            logger.warn({ userId, error: apiLogoutError.message }, 'Failed to delete API token during logout (might not be API auth)');
            logoutError = true; // Marquer qu'une erreur s'est produite
        }

        try {
            if (mode === 'web') {
                await auth.use('web').logout();
                logger.debug({ userId }, "Web session destroyed for logout");
            }
        } catch (webLogoutError) {
            logger.warn({ userId, error: webLogoutError.message }, 'Failed to destroy web session during logout (might not be web auth)');
            logoutError = true;
        }
        // --- Fin Logique métier ---

        if (!logoutError) {
            logger.info({ userId }, "User logged out successfully");
            // 🌍 i18n
            return response.ok({ message: t('auth.logoutSuccess') }); // Nouvelle clé
        } else {
            // Si une erreur s'est produite (ex: token déjà invalide?), mais l'utilisateur était authentifié au début
            logger.warn({ userId }, "Logout completed with potential errors (token/session might have been already invalid)");
            // 🌍 i18n
            // On peut quand même retourner un succès partiel ou un message d'erreur générique
            return response.ok({ message: t('auth.logoutCompletedWithIssues') }); // Nouvelle clé
        }
    }


    async me({ response, auth }: HttpContext) {
        // 🔐 Authentification (gérée par le middleware ou authenticate())
        await auth.authenticate();
        const user = auth.user!; // Garanti non null

        try {
            // --- Logique métier (inchangée) ---
            await user.load((loader) => {
                loader.load('user_addresses').load('user_phones');
            });
            const userData = {
                ...User.ParseUser(user), // Utiliser ParseUser pour la réponse standardisée
                addresses: user.user_addresses,
                phone_numbers: user.user_phones,
            };
            // Pas de message i18n, on retourne les données
            return response.ok({ user: userData });

        } catch (error) {
            logger.error({ userId: user.id, error: error.message, stack: error.stack }, 'Error fetching user details in /me');
            // 🌍 i18n
            return response.internalServerError({ message: t('auth.fetchMeFailed') }); // Nouvelle clé
        }
    }


    async update_user({ request, response, auth }: HttpContext) {
        // 🔐 Authentification
        await auth.authenticate();
        const user = auth.user!;

        let payload: Infer<typeof this.updateUserSchema>;
        try {
            // ✅ Validation Vine
            payload = await this.updateUserSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
            }
            throw error;
        }

        // --- Logique métier ---
        // Utiliser une transaction si plusieurs champs peuvent être modifiés et dépendent les uns des autres
        // Ici, nom et mot de passe sont indépendants, pas besoin de transaction stricte.
        try {
            if (payload.full_name) user.full_name = payload.full_name;
            if (payload.password) user.password = payload.password; // Hashage géré par hook User

            // Sauvegarder seulement si des modifications ont été faites
            if (user.$isDirty) {
                await user.save();
                logger.info({ user_id: user.id }, 'User profile updated');
            } else {
                logger.info({ user_id: user.id }, 'User profile update requested but no changes detected');
            }

            // 🌍 i18n
            return response.ok({ message: t('auth.profileUpdateSuccess'), user: User.ParseUser(user) }); // Nouvelle clé

        } catch (error) {
            logger.error({ user_id: user.id, error: error.message, stack: error.stack }, 'User profile update failed');
            // 🌍 i18n
            return response.internalServerError({ message: t('auth.profileUpdateFailed'), error: error.message }); // Nouvelle clé
        }
    }


    async delete_account({ response, auth, session }: HttpContext) {
        // 🔐 Authentification
        await auth.authenticate();
        // Caster pour accéder potentiellement à currentAccessToken (même si non utilisé ici)
        const user = auth.user! as UserWithToken;
        const userId = user.id;

        // Utiliser une transaction pour assurer la suppression atomique des données liées
        const trx = await db.transaction();
        try {
            // --- Logique métier (dans la transaction) ---
            // 1. Supprimer les tokens API

            const tokens = await User.accessTokens.all(user);
            for (const token of tokens) {
                await User.accessTokens.delete(user, token.identifier);
            }

            // 2. Supprimer les tokens de vérification email
            await EmailVerificationToken.query({ client: trx }).where('user_id', userId).delete();

            // 3. Supprimer les entrées d'authentification (social, email)
            await UserAuthentification.query({ client: trx }).where('user_id', userId).delete();

            // 5. Supprimer l'utilisateur lui-même
            await user.useTransaction(trx).delete();
            // --- Fin logique métier ---

            await trx.commit(); // Commit si tout s'est bien passé

            // Effacer la session web après la suppression réussie
            session.clear();

            logger.info({ userId }, 'User account deleted successfully');
            // 🌍 i18n
            return response.ok({ message: t('auth.accountDeleteSuccess') }); // Nouvelle clé

        } catch (error) {
            await trx.rollback(); // Annuler en cas d'erreur
            logger.error({ userId, error: error.message, stack: error.stack }, 'Account deletion failed');
            // 🌍 i18n
            return response.internalServerError({ message: t('auth.accountDeleteFailed') }); // Nouvelle clé
        }

    }
} // Fin de la classe AuthController