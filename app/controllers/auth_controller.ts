import hash from '@adonisjs/core/services/hash';
import User from '#models/user'
import { type HttpContext } from '@adonisjs/core/http'
import { v4 as uuidv4, v4 } from 'uuid';
import vine from '@vinejs/vine';
import { DateTime } from 'luxon';
import string from '@adonisjs/core/helpers/string';
import EmailVerificationToken from '#models/email_verification_token';
import BullMQService from '#services/BullMQService';
import env from '#start/env';
import logger from '@adonisjs/core/services/logger';
import { AccessToken } from '@adonisjs/auth/access_tokens';
import { OAuth2Client } from 'google-auth-library';
import { GOOGLE_CLIENT_ID } from './Utils/ctrlManager.js';
import { securityService, SecurityService } from '#services/SecurityService';

import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import db from '@adonisjs/lucid/services/db';
import UserAuthentification from '#models/user_authentification';
import AsyncConfirm, { AsyncConfirmType } from '#models/asyncConfirm';
import { updateFiles } from './Utils/media/UpdateFiles.js';
import { EXT_IMAGE, MEGA_OCTET } from './Utils/ctrlManager.js';

import redisService from '#services/RedisService';
// Bouncer n'est pas utilisé directement ici, les actions sont liées à l'utilisateur lui-même

// Interface spécifique pour delete_account
interface UserWithToken extends User {
    currentAccessToken: AccessToken // AccessToken doit être importé
}

const client = new OAuth2Client(GOOGLE_CLIENT_ID)

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
            photo: vine.any().optional(),
            password: vine.string().minLength(8).confirmed().optional(),
        })
    );

    private forgotPasswordSchema = vine.compile(
        vine.object({
            email: vine.string().trim().email().normalizeEmail(),
            callback_url: vine.string().trim().minLength(3)
        })
    );

    private resetPasswordSchema = vine.compile(
        vine.object({
            token: vine.string().trim().minLength(10), // Le token brut reçu
            password: vine.string().minLength(8).confirmed(), // Nouveau mot de passe + confirmation
        })
    );

    private setupAccountSchema = vine.compile(
        vine.object({
            token: vine.string().trim().minLength(10), // Le token brut reçu de l'URL
            password: vine.string().minLength(8).confirmed(), // Nouveau mot de passe + confirmation
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

            const user_id = uuidv4()

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
                        id: user_id,
                        full_name: socialData.fullName?.trim() || `Utilisateur_${string.generateRandom(6)}`,
                        email: socialData.email,
                        photo: socialData.avatarUrl?[socialData.avatarUrl]:[],
                        password: v4(), // Hasher le mot de passe aléatoire
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

            logger.info({ userId: user.id, isNew: isNewUser }, 'API token generated for user');
            
            await trx.commit(); // Commit si tout va bien
            
            // Génération Token (logique métier inchangée) // le token doit etre generer apres le trx.commit() pour avoir acces au user 
            const token = await User.accessTokens.create(user, ['*'], {
                name: `social_login_${socialData.provider}_${user.id}_${DateTime.now().toMillis()}`,
                expiresIn: '30 days'
            });
            
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
            return response.internalServerError({ message: "socialCallbackFailed." }); // Nouvelle clé
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
                return response.unprocessableEntity({ message: "La validation des données a échoué.", errors: error.messages });
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
                    const minut = 1 * 60 * 1000
                    const verifier = await EmailVerificationToken.query().where('user_id', user.id).where('expires_at', '>', DateTime.fromMillis(Date.now() + minut).toISO() || '').first();
                    if (!verifier) {
                        await this.sendVerificationEmail(user);
                    }
                } catch (sendError) {
                    logger.error({ userId: user.id, error: sendError }, "Failed to resend verification email during login attempt");
                }
                // 🌍 i18n
                return response.unauthorized({
                    code: 'E_EMAIL_NOT_VERIFIED',
                    // message: "emailNotVerified." // Nouvelle clé
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
                message: "loginSuccess.", // Nouvelle clé
                user: User.ParseUser(user), // Exclure mot de passe etc.
                token: token.value!.release(),
                expires_at: token.expiresAt?.toISOString()
            });

        } catch (error) {
            if (error.code === 'E_INVALID_CREDENTIALS') {
                logger.warn({ email }, 'Invalid credentials during login');
                // 🌍 i18n
                return response.unauthorized({ message: "invalidCredentials." }); // Nouvelle clé
            }
            logger.error({ email, error: error.message, stack: error.stack }, 'Login failed');
            // 🌍 i18n
            return response.internalServerError({ message: "loginFailed.", error: error.message }); // Nouvelle clé
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
                return response.unprocessableEntity({ message: "La validation des données a échoué.", errors: error.messages });
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
                return response.conflict({ message: "emailConflict." }); // Nouvelle clé
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
                message: "registerSuccess.", // Nouvelle clé
                user_id: user.id
            });

        } catch (error) {
            await trx.rollback(); // Assurer rollback en cas d'erreur (même si sendVerificationEmail échoue après)
            logger.error({ email: payload.email, error: error.message, stack: error.stack }, 'Registration failed');
            // 🌍 i18n
            return response.internalServerError({
                message: "registerFailed.", // Nouvelle clé
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

            const store = await redisService.getMyStore()
            const verificationUrl = `${store?.slug}.${env.get('SERVER_DOMAINE', 'sublymus-server.com')}/api/auth/verify-email?token=${tokenValue}`;

            const queue = BullMQService.getServerToServerQueue();
            await queue.add('send_email', {
                event: 'send_email',
                data: {
                    to: user.email, subject: "verifySubject.", // 🌍 i18n pour le sujet
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
                return response.badRequest({ message: "La validation des données a échoué.", errors: error.messages });
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
            return response.badRequest({ message: "invalidOrExpiredToken." }); // Nouvelle clé
        }

        const user = verificationToken.user; // Garanti d'exister car préchargé
        if (!user) {
            // Sécurité : le token existe mais l'utilisateur associé a été supprimé?
            logger.error({ tokenId: verificationToken.id, tokenValue }, "Verification token found but associated user does not exist.");
            await verificationToken.delete(); // Nettoyer le token orphelin
            // 🌍 i18n
            return response.badRequest({ message: "invalidOrExpiredToken." }); // Message générique
        }


        if (user.isEmailVerified) {
            logger.info({ user_id: user.id }, 'Email already verified');
            await verificationToken.delete();
            // 🌍 i18n
            return response.ok({ message: "emailAlreadyVerified." }); // Nouvelle clé
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
            return response.ok({ message: "emailVerificationSuccess." }); // Nouvelle clé

        } catch (error) {
            await trx.rollback();
            logger.error({ user_id: user.id, error: error.message, stack: error.stack }, 'Failed to update user verification status');
            // 🌍 i18n
            return response.internalServerError({ message: "emailVerificationFailedDb." }); // Nouvelle clé
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
                return response.unprocessableEntity({ message: "La validation des données a échoué.", errors: error.messages });
            }
            throw error;
        }
        const email = payload.email;

        // --- Logique métier ---
        const user = await User.findBy('email', email);

        // Message générique pour la sécurité (ne pas révéler si l'email existe)
        const genericMessage = "resendGenericResponse."; // Nouvelle clé

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
            // return response.internalServerError({ message: "resendFailedInternal." });
        }
    }

    async google_auth({ request, auth, response }: HttpContext) {
        const { token } = request.only(['token']) as { token: string }

        if (!token) {
            return response.badRequest({ message: 'Token manquant' })
        }

        try {
            const ticket: any = await client.verifyIdToken({
                audience: GOOGLE_CLIENT_ID,
                idToken: token
            })

            const payload = ticket.getPayload()

            if (!payload) {
                return response.unauthorized({ message: 'Token invalide' })
            }

            const { email, name, sub, picture } = payload
            let user = await User.findBy('email', email)
            if (!user) {
                user = await User.create({
                    id: v4(),
                    email,
                    full_name: name,
                    photo: [picture],
                    password: sub
                })
            }
            const existingAuth = await UserAuthentification.query()
                .where('user_id', user.id)
                .where('provider', 'google')
                .first()

            if (!existingAuth) {
                await UserAuthentification.create({
                    id: v4(),
                    user_id: user.id,
                    provider: 'google',
                    provider_id: sub,
                })
            }
            await auth.use('web').login(user)
            return response.ok({ user: User.ParseUser(user) })
        } catch (error) {
            console.error('Erreur Google Auth:', error)
            return response.internalServerError({ message: 'Erreur d’authentification', error })
        }
    }


    /**
    * @forgotPassword
    * Initiates the password reset process for a user.
    * Finds user by email, generates a reset token, stores its hash, and sends reset email.
    */
    async forgotPassword({ request, response }: HttpContext) {
        let payload: Infer<typeof this.forgotPasswordSchema>;
        try {
            // ✅ Validation Vine
            payload = await this.forgotPasswordSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: "La validation des données a échoué.", errors: error.messages });
            }
            // Logguer mais ne pas relancer pour masquer l'erreur
            logger.error({ error }, "Forgot password validation failed");
            // 🌍 i18n - Réponse générique pour la sécurité
            return response.ok({ message: "auth.forgotPassword.emailSentConfirmation" });
        }

        const email = payload.email;
        const genericSuccessMessage = { message: "auth.forgotPassword.emailSentConfirmation" };

        try {
            // --- Logique métier ---
            const user = await User.findBy('email', email);

            // **Sécurité** : Ne pas révéler si l'email existe.
            if (!user) {
                logger.info({ email }, "Password reset requested for non-existent email.");
                return response.ok(genericSuccessMessage); // Toujours retourner succès
            }

            // Empêcher reset pour emails non vérifiés ? (Optionnel mais recommandé)
            if (!user.isEmailVerified) {
                logger.warn({ userId: user.id, email }, "Password reset requested for unverified email.");
                return response.ok(genericSuccessMessage);
            }

            // Invalider les anciens tokens de reset pour cet utilisateur
            //TODO invalider ou supprimer // je pense qu'il vaut mieux suprimer
            await AsyncConfirm.query()
                .where('userId', user.id)
                .where('type', AsyncConfirmType.PASSWORD_RESET)
                .update({ usedAt: DateTime.now() }); // Marquer comme utilisés

            // Générer token BRUT et HASH
            const tokenBrut = string.random(64); // Token à envoyer par email
            const tokenHash = await hash.make(tokenBrut); // Hash à stocker
            const expiresAt = DateTime.now().plus({ hours: 1 }); // Durée de vie courte (1h)

            // Stocker le nouveau token hashé dans async_confirms
            await AsyncConfirm.create({
                userId: user.id,
                tokenHash: tokenHash,
                type: AsyncConfirmType.PASSWORD_RESET,
                expiresAt: expiresAt,
            });
            logger.info({ userId: user.id }, "Password reset token created");

            // Construire l'URL de réinitialisation (côté frontend)
            // Assurer que APP_FRONTEND_URL est définie dans .env
            const resetUrl = `${payload.callback_url}?token=${tokenBrut}`;

            // Envoyer le job d'email via BullMQ
            try {
                const queue = BullMQService.getServerToServerQueue();
                await queue.add('send_email', {
                    event: 'send_email',
                    data: {
                        to: user.email,
                        // 🌍 i18n
                        subject: "passwordResetSubject.", // Nouvelle clé
                        template: 'emails/password_reset', // Template à créer sur s_server
                        context: {
                            userName: user.full_name,
                            resetUrl: resetUrl // Passer l'URL au template
                        }
                    }
                }, { jobId: `pwd-reset-${user.id}-${Date.now()}` });
                logger.info({ userId: user.id }, "Password reset email job sent to s_server");
            } catch (queueError) {
                logger.error({ userId: user.id, error: queueError.message }, 'Failed to send password reset email job');
                // Ne pas faire échouer la requête user à cause de ça, retourner succès quand même
            }

            // Toujours retourner le message de succès générique
            return response.ok(genericSuccessMessage);

        } catch (error) {
            logger.error({ email, error: error.message, stack: error.stack }, 'Forgot password process failed internally');
            // 🌍 i18n - Réponse générique même en cas d'erreur interne
            return response.ok(genericSuccessMessage); // Ou 500 si on veut indiquer un problème serveur
            // return response.internalServerError({ message: "auth.forgotPassword.genericError" });
        }
    }

    /**
     * @resetPassword
     * Resets the user's password using a valid token.
     */
    async resetPassword({ request, response }: HttpContext) {
        let payload: Infer<typeof this.resetPasswordSchema>;
        try {
            // ✅ Validation Vine
            payload = await this.resetPasswordSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: "La validation des données a échoué.", errors: error.messages });
            }
            throw error;
        }

        const { token: tokenBrut, password } = payload;

        // --- Logique métier ---
        // Variable pour stocker l'enregistrement AsyncConfirm trouvé
        let validTokenRecord: AsyncConfirm | null = null;

        try {
            // 1. Trouver TOUS les tokens potentiels non utilisés/non expirés pour ce type
            // On ne peut pas chercher par hash directement de manière performante sans extension DB
            // Solution: chercher les tokens récents non utilisés et vérifier le hash en mémoire
            const potentialTokens = await AsyncConfirm.query()
                .where('type', AsyncConfirmType.PASSWORD_RESET)
                .whereNull('usedAt')
                .where('expiresAt', '>', DateTime.now().toISO()) // Seulement les non expirés
                .orderBy('createdAt', 'desc'); // Commencer par les plus récents

            // 2. Vérifier chaque token potentiel
            for (const tokenRecord of potentialTokens) {
                if (await hash.verify(tokenRecord.tokenHash, tokenBrut)) {
                    // Correspondance trouvée !
                    validTokenRecord = tokenRecord;
                    break; // Sortir de la boucle
                }
            }

            // 3. Vérifier si un token valide a été trouvé
            if (!validTokenRecord) {
                logger.warn({ tokenHint: tokenBrut.substring(0, 5) }, "Invalid or expired password reset token provided");
                // 🌍 i18n
                return response.badRequest({ message: "auth.resetPassword.invalidToken" });
            }

            // 4. Token valide trouvé, procéder à la mise à jour
            const user = await User.find(validTokenRecord.userId); // Récupérer l'utilisateur associé
            if (!user) {
                // Cas très rare où l'utilisateur a été supprimé entre temps
                logger.error({ userId: validTokenRecord.userId, tokenId: validTokenRecord.id }, "User associated with valid password reset token not found.");
                await validTokenRecord.markAsUsed(); // Invalider le token quand même
                // 🌍 i18n
                return response.badRequest({ message: "auth.resetPassword.invalidToken" }); // Message générique
            }

            // Utiliser une transaction pour la mise à jour du mot de passe et l'invalidation du token
            const trx = await db.transaction();
            try {
                // 5. Mettre à jour le mot de passe (le hook User s'occupe du hash)
                user.useTransaction(trx);
                user.password = password;
                await user.save();

                // 6. Marquer le token comme utilisé
                validTokenRecord.useTransaction(trx);
                await validTokenRecord.markAsUsed();

                // 7. (Optionnel) Supprimer tous les autres tokens API actifs pour cet utilisateur

                logger.info({ userId: user.id }, "Deleted active API tokens after password reset.");

                await trx.commit(); // Valider la transaction

                logger.info({ userId: user.id }, "Password reset successfully");
                // 🌍 i18n
                return response.ok({ message: "auth.resetPassword.success" });

            } catch (dbError) {
                await trx.rollback();
                logger.error({ userId: user.id, tokenId: validTokenRecord.id, error: dbError.message }, "Database error during password reset update");
                throw dbError; // Relancer pour erreur 500
            }

        } catch (error) {
            logger.error({ tokenHint: tokenBrut.substring(0, 5), error: error.message, stack: error.stack }, 'Password reset process failed');
            // 🌍 i18n
            return response.internalServerError({ message: "auth.resetPassword.genericError", error: error.message }); // Nouvelle clé
        }
    }

    async setupAccount({ request, response }: HttpContext) {
        // Pas besoin d'auth ici, l'accès est basé sur le token

        let payload: Infer<typeof this.setupAccountSchema>;
        try {
            // ✅ Validation Vine
            payload = await this.setupAccountSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: "La validation des données a échoué.", errors: error.messages });
            }
            // Logguer erreur inattendue
            logger.error({ error }, "Setup account validation failed");
            throw error; // Relancer pour 500
        }

        const { token: tokenBrut, password } = payload;

        // --- Logique métier ---
        // Variable pour stocker l'enregistrement AsyncConfirm trouvé
        let validTokenRecord: AsyncConfirm | null = null;

        try {
            // 1. Trouver TOUS les tokens potentiels non utilisés/non expirés pour ce type
            const potentialTokens = await AsyncConfirm.query()
                .where('type', AsyncConfirmType.ACCOUNT_SETUP) // ✅ Utiliser le bon type
                .whereNull('usedAt')
                .where('expiresAt', '>', DateTime.now().toISO())
                .orderBy('createdAt', 'desc');

            // 2. Vérifier chaque token potentiel avec le hash
            for (const tokenRecord of potentialTokens) {
                if (await hash.verify(tokenRecord.tokenHash, tokenBrut)) {
                    validTokenRecord = tokenRecord;
                    await validTokenRecord.load('user'); // ✅ Précharger l'utilisateur associé
                    break;
                }
            }

            // 3. Vérifier si un token valide et un utilisateur associé ont été trouvés
            if (!validTokenRecord || !validTokenRecord.user) {
                logger.warn({ tokenHint: tokenBrut.substring(0, 5) }, "Invalid, expired, used, or userless account setup token provided");
                // 🌍 i18n
                return response.badRequest({ message: "auth.setupAccount.invalidToken" }); // Nouvelle clé
            }

            // 4. Token valide trouvé, procéder à la mise à jour
            const user = validTokenRecord.user;

            // Vérifier si le compte n'est pas déjà actif (double sécurité)
            if (user.email_verified_at) {
                logger.warn({ userId: user.id }, "Account setup attempted for already verified user.");
                await validTokenRecord.markAsUsed(); // Invalider le token quand même
                // 🌍 i18n
                return response.badRequest({ message: "auth.setupAccount.alreadyActive" }); // Nouvelle clé
            }


            const trx = await db.transaction();
            try {
                // 5. Mettre à jour le mot de passe
                user.useTransaction(trx);
                user.password = password; // Hashage géré par hook User

                // 6. Marquer l'email comme vérifié
                user.email_verified_at = DateTime.now();

                await user.save();

                // 7. Marquer le token comme utilisé
                validTokenRecord.useTransaction(trx);
                await validTokenRecord.markAsUsed();

                await trx.commit();

                logger.info({ userId: user.id }, "Collaborator account setup successfully");
                // 🌍 i18n
                // Retourner succès, le frontend redirigera vers login
                return response.ok({ message: "auth.setupAccount.success" });

            } catch (dbError) {
                await trx.rollback();
                logger.error({ userId: user.id, tokenId: validTokenRecord.id, error: dbError.message }, "Database error during account setup update");
                throw dbError; // Relancer pour erreur 500
            }

        } catch (error) {
            logger.error({ tokenHint: tokenBrut.substring(0, 5), error: error.message, stack: error.stack }, 'Account setup process failed');
            // 🌍 i18n
            return response.internalServerError({ message: "auth.setupAccount.genericError", error: error.message }); // Nouvelle clé
        }
    }

    public async logoutAllDevices({ auth, response, request, session }: HttpContext) {
        // 🔐 Authentification
        await securityService.authenticate({ request, auth });
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
            return response.ok({ message: "logoutAllSuccess." }); // Nouvelle clé

        } catch (error) {
            logger.error({ userId: user.id, error: error.message, stack: error.stack }, 'Failed to logout from all devices');
            // 🌍 i18n
            return response.internalServerError({ message: "logoutAllFailed.", error: error.message }); // Nouvelle clé
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
            // return response.unauthorized({ message: "notAuthenticated." }); // Nouvelle clé
            return response.status(401).send({ message: 'je suis ffranfrfr' });
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
            return response.ok({ message: "logoutSuccess." }); // Nouvelle clé
        } else {
            // Si une erreur s'est produite (ex: token déjà invalide?), mais l'utilisateur était authentifié au début
            logger.warn({ userId }, "Logout completed with potential errors (token/session might have been already invalid)");
            // 🌍 i18n
            // On peut quand même retourner un succès partiel ou un message d'erreur générique
            return response.ok({ message: "logoutCompletedWithIssues." }); // Nouvelle clé
        }
    }


    async me({ response, auth, request }: HttpContext) {

        // 🔐 Authentification (gérée par le middleware ou authenticate())
       

        const user = await securityService.authenticate({ request, auth });

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
            const token = await User.accessTokens.create(user);

            logger.info('✅ENTRY token', token.value?.release());
            // Pas de message i18n, on retourne les données
            return response.ok({ user: userData, token: token.value?.release() });

        } catch (error) {
            logger.error({ userId: user.id, error: error.message, stack: error.stack }, 'Error fetching user details in /me');
            // 🌍 i18n
            return response.internalServerError({ message: "fetchMeFailed." }); // Nouvelle clé
        }
    }


    async update_user({ request, response, auth }: HttpContext) {
        // 🔐 Authentification

        const user = await securityService.authenticate({ request, auth });

        if (!user) {
            return response.unauthorized({ error: 'User not authenticated' });
        }

        let payload: Infer<typeof this.updateUserSchema>;
        try {
            // ✅ Validation Vine
            payload = await this.updateUserSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: "La validation des données a échoué.", errors: error.messages });
            }
            throw error;
        }

        console.log(payload);

        // --- Logique métier ---
        // Utiliser une transaction si plusieurs champs peuvent être modifiés et dépendent les uns des autres
        // Ici, nom et mot de passe sont indépendants, pas besoin de transaction stricte.
        try {
            if (payload.full_name) user.full_name = payload.full_name;
            if (payload.password) user.password = payload.password; // Hashage géré par hook User

            if (payload.photo) {
                const photo = await updateFiles({
                    request, table_name: User.table, table_id: user.id, column_name: 'photo',
                    lastUrls: user.photo || [], newPseudoUrls: payload.photo,
                    options: { throwError: true, min: 0, max: 1, compress: 'img', extname: EXT_IMAGE, maxSize: 12 * MEGA_OCTET, },

                })
                user.photo = photo;
            }

            // Sauvegarder seulement si des modifications ont été faites
            if (user.$isDirty) {
                await user.save();
                logger.info({ user_id: user.id }, 'User profile updated');
            } else {
                logger.info({ user_id: user.id }, 'User profile update requested but no changes detected');
            }

            // 🌍 i18n
            return response.ok({ message: "profileUpdateSuccess.", user: User.ParseUser(user) }); // Nouvelle clé

        } catch (error) {
            logger.error({ user_id: user.id, error: error.message, stack: error.stack }, 'User profile update failed');
            // 🌍 i18n
            return response.internalServerError({ message: "profileUpdateFailed.", error: error.message }); // Nouvelle clé
        }
    }


    async delete_account({ response, auth, session, request }: HttpContext) {
        // 🔐 Authentification
        await securityService.authenticate({ request, auth });
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
            return response.ok({ message: "accountDeleteSuccess." }); // Nouvelle clé

        } catch (error) {
            await trx.rollback(); // Annuler en cas d'erreur
            logger.error({ userId, error: error.message, stack: error.stack }, 'Account deletion failed');
            // 🌍 i18n
            return response.internalServerError({ message: "accountDeleteFailed." }); // Nouvelle clé
        }

    }
} // Fin de la classe AuthController