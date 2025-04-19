import hash from '@adonisjs/core/services/hash';
import User from '#models/user'
import { type HttpContext } from '@adonisjs/core/http'
import { v4 as uuidv4 } from 'uuid'; // Garder uuidv4 pour User.id
import { deleteFiles } from './Utils/media/DeleteFiles.js';
import UserAuthentification from '#models/user_authentification';
import vine from '@vinejs/vine';
import { DateTime } from 'luxon';
import string from '@adonisjs/core/helpers/string'; // Pour générer le token
import EmailVerificationToken from '#models/email_verification_token'; // Importer le nouveau modèle
import BullMQService from '#services/BullMQService'; // Importer le service BullMQ
import env from '#start/env'; // Pour l'URL de base
import logger from '@adonisjs/core/services/logger';
import { AccessToken } from '@adonisjs/auth/access_tokens';
import { SecurityService } from '#services/SecurityService';

export default class AuthController {

  
  // --- INTERNAL SOCIAL CALLBACK (Appelé par s_server) ---
  async handleSocialCallbackInternal({ request, response }: HttpContext) {
    // !!! Le middleware InternalApiAuthMiddleware est appliqué via les routes !!!
    new SecurityService().verifyInternalRequest(request);
    // 1. Définir le schéma de validation pour les données attendues de s_server
    const socialCallbackSchema = vine.compile(
      vine.object({
        provider: vine.string().trim().minLength(1), // ex: 'google', 'facebook'
        providerId: vine.string().trim().minLength(1), // ID unique fourni par le provider
        email: vine.string().trim().email().normalizeEmail(), // Email fourni par le provider
        fullName: vine.string().trim().optional(), // Nom complet (peut être null)
        avatarUrl: vine.string().url().optional() // URL de l'avatar (peut être null)
        // Ajouter d'autres champs si s_server les envoie (ex: locale)
      })
    );

    // 2. Valider les données reçues
    let socialData: {
        provider: string;
        providerId: string;
        email: string;
        fullName?: string | undefined;
        avatarUrl?: string | undefined;
    };
    try {
        // Utiliser validate pour lancer une erreur en cas d'échec
        socialData = await request.validateUsing(socialCallbackSchema);
    } catch (error) {
      console.log({ validationErrors: error.messages, body: request.body() }, 'Validation failed for internal social callback');
        // Renvoyer les erreurs de validation spécifiques (422 Unprocessable Entity)
        return response.unprocessableEntity(error.messages);
    }

    console.log({ provider: socialData.provider, email: socialData.email }, 'Processing internal social callback');

    try {
      let user: User;
      let isNewUser = false;
      let needsLinking = false;

      // 3. Chercher l'entrée d'authentification par provider/providerId
      const authEntry = await UserAuthentification.query()
        .where('provider', socialData.provider)
        .where('provider_id', socialData.providerId)
        .preload('user') // Charger l'utilisateur associé
        .first();

      if (authEntry && authEntry.user) {
        // --- Cas 1: Utilisateur trouvé via le provider social ---
        user = authEntry.user;
        console.log({ userId: user.id, provider: socialData.provider }, 'Existing user found via social provider ID');

        // Optionnel : Mettre à jour les informations si elles sont plus récentes/meilleures ?
        // (Attention: ne pas écraser un nom choisi par l'utilisateur avec un nom social ?)
        // user.full_name = socialData.fullName ?? user.full_name;
        // if (socialData.avatarUrl) user.photos = [socialData.avatarUrl]; // Faut-il gérer plusieurs photos?
        // if (user.$isDirty) await user.save(); // Sauver si modifié

      } else {
        // --- Pas trouvé par provider, chercher par email ---
        const userByEmail = await User.findBy('email', socialData.email);

        if (userByEmail) {
          // --- Cas 2: Utilisateur trouvé par email ---
          user = userByEmail;
          needsLinking = true; // Il faudra lier ce provider à cet utilisateur
          console.log({ userId: user.id, email: user.email }, 'Existing user found via email, linking social provider');

          // Marquer l'email comme vérifié (si ce n'est pas déjà le cas)
          if (!user.isEmailVerified) {
            user.email_verified_at = DateTime.now();
            await user.save();
            console.log({ userId: user.id }, 'Email marked as verified via social login');
          }

        } else {
          // --- Cas 3: Nouvel utilisateur ---
          isNewUser = true;
          console.log({ email: socialData.email, provider: socialData.provider }, 'Creating new user from social login');

          user = await User.create({
            id: uuidv4(),
            // Fournir un nom par défaut robuste si non fourni
            full_name: socialData.fullName?.trim() || `Utilisateur_${string.generateRandom(6)}`,
            email: socialData.email,
            password: string.random(40), // Mot de passe aléatoire et long (inutilisable directement)
            // Gérer la photo ? Faut-il télécharger l'avatar ou juste stocker l'URL ?
            // photos: socialData.avatarUrl ? [socialData.avatarUrl] : [],
            email_verified_at: DateTime.now(), // L'email est considéré comme vérifié
          });
          needsLinking = true; // Il faudra lier ce provider au nouvel utilisateur
        }

        // --- Lier le provider si nécessaire (Cas 2 et 3) ---
        if (needsLinking) {
          await UserAuthentification.create({
            id: uuidv4(),
            user_id: user.id,
            provider: socialData.provider as any,
            provider_id: socialData.providerId,
          });
           console.log({ userId: user.id, provider: socialData.provider }, 'Social provider linked to user');
        }
      }

      // --- 4. Générer le Token d'Accès API ---
      const token = await User.accessTokens.create(user, ['*'], { // Donner tous les scopes '*' pour l'instant
        name: `social_login_${socialData.provider}_${user.id}_${DateTime.now().toMillis()}`,
        expiresIn: '30 days'
      });
      console.log({ userId: user.id, isNew: isNewUser }, 'API token generated for user');

      // --- 5. Renvoyer le token à s_server ---
      return response.ok({
        token: token.value!.release(), // Ne pas oublier .release() !
        expires_at: token.expiresAt?.toISOString(),
        is_new_user: isNewUser // Info utile pour s_server ou le frontend ?
      });

    } catch (error) {
       logger.error({ provider: socialData.provider, email: socialData.email, error: error.message }, 'Failed to handle internal social callback');
       // Erreur générique pour ne pas fuiter d'informations
      return response.internalServerError({ message: 'Erreur interne lors du traitement de la connexion sociale.' });
    }
  }

  // --- LOGIN (API Token Based) ---
  async login({ request, response, auth }: HttpContext) {
    const loginSchema = vine.compile(
      vine.object({
        email: vine.string().email(),
        password: vine.string()
      })
    );
    const { email, password } = await request.validateUsing(loginSchema);

    try {
      // 1. Vérifier les crédentials
      const user = await User.verifyCredentials(email, password);

      // 2. Vérifier si l'email est confirmé !
      if (!user.isEmailVerified) {
        logger.warn({ user_id: user.id, email: user.email }, 'Login attempt with unverified email');
        // Optionnel : Peut-être renvoyer l'email de vérification ici ?
        await this.sendVerificationEmail(user); // TODO verifier si l'email est déjà envoyé, (date, validiter du token etc..)
        return response.unauthorized({
          code: 'E_EMAIL_NOT_VERIFIED',
          message: 'Veuillez vérifier votre adresse email avant de vous connecter.'
        });
      }

      // 3. Générer le Token d'Accès API
      const token = await User.accessTokens.create(
        user,
        ['*'], // Permissions (scopes) - '*' pour tout pour l'instant
        {
          name: `api_login_${user.id}_${DateTime.now().toMillis()}`,
          expiresIn: '30 days' // Durée de vie du token
        }
      );

      console.log({ user_id: user.id }, 'User logged in successfully via API token');

      // 4. Retourner le token et les infos user
      return response.ok({
        user: User.ParseUser(user), // Utiliser ParseUser si elle existe et est utile
        token: token.value!.release(), // IMPORTANT: .release() pour avoir le token brut à envoyer au client
        expires_at: token.expiresAt?.toISOString() // Envoyer la date d'expiration
      });

    } catch (error) {
      // Gérer les erreurs d'authentification (mauvais email/pass)
      if (error.code === 'E_INVALID_CREDENTIALS') {
        logger.warn({ email }, 'Invalid credentials during login');
        return response.unauthorized({ message: 'Email ou mot de passe incorrect' });
      }
      // Gérer les autres erreurs
      logger.error({ email, error: error.message }, 'Login failed');
      return response.internalServerError({ message: 'La connexion a échoué', error: error.message });
    }
  }

  // --- REGISTER (Email/Password with Verification) ---
  public async register_mdp({ request, response }: HttpContext) {
    const registerSchema = vine.compile(
      vine.object({
        full_name: vine.string().trim().minLength(3).maxLength(255), // MaxLength 25 semblait court
        email: vine.string().trim().email().normalizeEmail(), // Normaliser l'email
        password: vine.string().minLength(8).confirmed(), // Ajouter confirmation mot de passe
        // photo: vine.string().optional() // Gérer upload/lien photo séparément ?
      })
    );

    // Valider la requête (inclut password_confirmation si .confirmed() est utilisé)
    const payload = await request.validateUsing(registerSchema);

    // Vérifier si l'email existe déjà
    const existingUser = await User.findBy('email', payload.email);
    if (existingUser) {
      logger.warn({ email: payload.email }, 'Registration attempt with existing email');
      return response.conflict({ message: 'Un compte existe déjà avec cette adresse email.' });
    }

    let user: User | null = null;
    try {
      // Créer l'utilisateur (email_verified_at sera null par défaut)
      user = await User.create({
        id: uuidv4(),
        full_name: payload.full_name,
        email: payload.email,
        password: payload.password, // Le hashage est fait par le hook du modèle User normalement
      });
      logger.info({ user_id: user.id, email: user.email }, 'User created');

      // Créer l'entrée d'authentification (si nécessaire)
      await UserAuthentification.create({
        id: uuidv4(),
        user_id: user.id,
        provider: 'email',
        provider_id: user.email,
      });

      // Générer et envoyer l'email de vérification
      await this.sendVerificationEmail(user);

      // PAS de login ici, l'utilisateur doit vérifier son email
      return response.created({
        message: 'Inscription réussie ! Veuillez vérifier votre boîte email pour activer votre compte.',
        // On peut retourner l'ID ou l'email si utile pour le frontend
        user_id: user.id
      });

    } catch (error) {
      logger.error({ email: payload.email, error: error.message }, 'Registration failed');
      // Si l'utilisateur a été créé mais l'envoi d'email échoue, que faire ?
      // On pourrait tenter de le supprimer (rollback manuel) ou juste logguer.
      // if (user && !user.$isDeleted) { await user.delete(); } // Optionnel: rollback
      return response.internalServerError({
        message: 'Une erreur est survenue lors de l\'inscription.',
        error: error.message,
      });
    }
  }

  // --- METHODE HELPER pour envoyer l'email de vérification ---
  private async sendVerificationEmail(user: User): Promise<void> {
    // 1. Invalider les anciens tokens pour cet utilisateur (bonne pratique)
    await EmailVerificationToken.query().where('user_id', user.id).delete();

    // 2. Générer un token de vérification sécurisé
    const tokenValue = string.random(64); // Génère une chaîne aléatoire
    const expires_at = DateTime.now().plus({ hours: 24 }); // Durée de vie

    // 3. Stocker le token dans la base de données
    const verificationToken = await EmailVerificationToken.create({
      user_id: user.id,
      token: tokenValue,
      expires_at: expires_at,
    });
    logger.info({ user_id: user.id, tokenId: verificationToken.id }, 'Email verification token created');

    // 4. Construire l'URL de vérification
    const verificationUrl = `${env.get('APP_URL')}/api/auth/verify-email?token=${tokenValue}`;
    // NOTE: APP_URL doit être l'URL *publique* de s_api (ex: https://api.maboutique.com)
    // Ou une URL du frontend qui appelle ensuite cette API

    // 5. Envoyer le job à s_server via BullMQ
    try {
      const queue = BullMQService.getServerToServerQueue();
      await queue.add('send_email', {
        event: 'send_email',
        data: {
          to: user.email,
          subject: 'Vérifiez votre adresse email - Sublymus',
          template: 'emails/verify_email', // Le template doit exister dans s_server
          context: {
            userName: user.full_name,
            verificationUrl: verificationUrl
          }
        }
      }, { jobId: `verify-email-${user.id}-${Date.now()}` });
      logger.info({ user_id: user.id, email: user.email }, 'Verification email job sent to s_server');
    } catch (queueError) {
      logger.error({ user_id: user.id, error: queueError.message }, 'Failed to send verification email job');
      // Que faire si l'ajout à la queue échoue ? L'inscription a réussi mais l'email n'est pas parti.
      // Il faudrait peut-être une tâche de fond qui vérifie les utilisateurs non vérifiés sans token récent ?
      // Ou exposer une API pour renvoyer l'email de vérif.
      // Pour l'instant, on logue l'erreur. L'utilisateur pourra demander à renvoyer l'email plus tard.
      // On pourrait aussi faire échouer l'inscription ici si l'email est critique.
      // throw new Error('Failed to queue verification email.'); // Optionnel
    }
  }

  // --- VERIFY EMAIL ---
  async verifyEmail({ request, response }: HttpContext) {
    const tokenValue = request.input('token');

    if (!tokenValue) {
      return response.badRequest({ message: 'Token de vérification manquant.' });
    }

    // Rechercher le token
    const verificationToken = await EmailVerificationToken.query()
      .where('token', tokenValue)
      .preload('user') // Charger l'utilisateur associé
      .first();

    // Vérifier si le token existe et n'est pas expiré
    if (!verificationToken || verificationToken.expires_at < DateTime.now()) {
      logger.warn({ token: tokenValue }, 'Invalid or expired email verification token used');
      return response.badRequest({ message: 'Le lien de vérification est invalide ou a expiré.' });
    }

    const user = verificationToken.user;

    // Vérifier si l'email est déjà vérifié (au cas où l'utilisateur clique plusieurs fois)
    if (user.isEmailVerified) {
      logger.info({ user_id: user.id }, 'Email already verified');
      // Supprimer le token quand même
      await verificationToken.delete();
      return response.ok({ message: 'Votre email est déjà vérifié.' });
    }

    // Mettre à jour l'utilisateur et supprimer le token
    try {
      user.email_verified_at = DateTime.now();
      await user.save();
      await verificationToken.delete();
      logger.info({ user_id: user.id }, 'Email successfully verified');

      // Que faire ensuite ? Rediriger vers le login ? Renvoyer un message de succès ?
      // Pour une API, renvoyer un message est souvent suffisant.
      return response.ok({ message: 'Email vérifié avec succès. Vous pouvez maintenant vous connecter.' });

    } catch (error) {
      logger.error({ user_id: user.id, error: error.message }, 'Failed to update user verification status');
      return response.internalServerError({ message: 'Erreur lors de la vérification de l\'email.' });
    }
  }

  // --- RESEND VERIFICATION EMAIL (Optionnel mais recommandé) ---
  async resendVerification({ request, response }: HttpContext) {
    const resendSchema = vine.compile(vine.object({ email: vine.string().email() }));
    const { email } = await request.validateUsing(resendSchema);

    const user = await User.findBy('email', email);

    if (!user) {
      // Ne pas révéler si l'email existe ou non pour des raisons de sécurité
      logger.info({ email }, 'Resend verification attempt for non-existent or unverified email');
      return response.ok({ message: 'Si un compte avec cet email existe et n\'est pas vérifié, un nouvel email de vérification a été envoyé.' });
    }

    if (user.isEmailVerified) {
      logger.info({ user_id: user.id }, 'Resend verification attempt for already verified email');
      return response.ok({ message: 'Votre email est déjà vérifié.' });
    }

    try {
      // Renvoyer l'email (la méthode helper invalide les anciens tokens)
      await this.sendVerificationEmail(user);
      return response.ok({ message: 'Un nouvel email de vérification a été envoyé.' });
    } catch (error) {
      logger.error({ user_id: user.id, error: error.message }, 'Failed to resend verification email');
      return response.internalServerError({ message: 'Erreur lors du renvoi de l\'email.' });
    }
  }

  public async logoutAllDevices({ auth, response, session }: HttpContext) {

    const user = await auth.authenticate();

    const tokens = await User.accessTokens.all(user);
    for (const token of tokens) {
        await User.accessTokens.delete(user, token.identifier);
    }
    session.clear();
    
    return response.ok({ message: 'Déconnexion de tous les appareils réussie.' });
}

  // --- LOGOUT (API Token + Web Session) ---
  public async logout({ auth, response }: HttpContext) {

    let mode: 'api' | 'web'|'' = '';
    let user : User|null|(User & { currentAccessToken: AccessToken; }) = null;
    try {
      user = await auth.use('api').authenticate()
      if(user) mode = 'api'
    } catch (error) {}
    
    try {
      user = await auth.use('web').authenticate()
      if(user) mode = 'web'
    } catch (error) {}

    try {
      if (mode === 'api' && user) {
        await User.accessTokens.delete(user, (user as any).currentAccessToken?.identifier);
      }
    } catch (error) {
     error = 'Failed to logout API token (might not be API auth)';
    }
    let error = ''
    try {
      // Essayer de fermer la session Web (si l'utilisateur est authentifié via Web)
      if (mode === 'web') {
        await auth.use('web').logout();
      }
    } catch (error) {
    error = 'Failed to logout web session (might not be web auth)';
    }

    if (!error) {
      return response.ok({ message: 'Déconnexion réussie.' });
    } else {
      // Si on arrive ici, l'utilisateur n'était probablement pas authentifié via l'un ou l'autre
      return response.unauthorized({ message: 'Utilisateur non authentifié.' });
    }
  }

  // --- ME (Utilise le Middleware Hybride) ---
  async me({ response, auth }: HttpContext) {
    // Pas besoin de vérifier auth.use('web').check() ici.
    // Le middleware hybride (ou la config `auth.authenticate()`) garantit
    // que si on arrive ici, auth.user est défini.
    const user = await auth.authenticate(); // Utiliser '!' car le middleware garantit qu'il existe
    try {

      // Charger les relations comme avant
      await user.load((loader) => {
        loader
          .load('user_addresses')
          .load('user_phones')
      });

      const userData = {
        ...User.ParseUser(user.$attributes), // Assure-toi que ParseUser est statique ou accessible
        addresses: user.user_addresses,//.map(address => ({ /* ... */ })),
        phone_numbers: user.user_phones,//.map(phone => ({ /* ... */ }))
      };

      return response.ok({ user: userData });
    } catch (error) {
      // Cette erreur ne devrait pas être une erreur d'authentification ici
      // car le middleware l'aurait interceptée. Plutôt une erreur BDD ?
      logger.error({ user_id: auth.user?.id, error: error.message }, 'Error fetching user details in /me');
      return response.internalServerError({ message: 'Erreur récupération informations utilisateur.' });
    }
  }

  // --- UPDATE USER (Utilise le Middleware Hybride) ---
  async update_user({ request, response, auth }: HttpContext) {
    // `auth.user` est garanti par le middleware
    const user = await auth.authenticate();
    const updateSchema = vine.compile(
      vine.object({
        full_name: vine.string().trim().minLength(3).maxLength(255).optional(),
        password: vine.string().minLength(8).confirmed().optional(), // Confirmer si on change le mot de passe
      })
    );

    try {
      const payload = await request.validateUsing(updateSchema);

      if (payload.full_name) user.full_name = payload.full_name;
      // Le hashage du mot de passe est géré par le hook du modèle User lors du save
      if (payload.password) user.password = payload.password;

      await user.save();
      logger.info({ user_id: user.id }, 'User profile updated');

      // Recharger les données pour être sûr (ou juste retourner les champs modifiés)
      // Optionnel: Recharger l'utilisateur pour avoir toutes les données à jour ?
      // await user.refresh()
      // await user.load(...) // Recharger relations si nécessaire

      return response.ok(User.ParseUser(user)); // Utiliser ParseUser

    } catch (error) {
      // Gérer les erreurs de validation Vine
      if (error.code === 'E_VALIDATION_ERROR') {
        return response.unprocessableEntity(error.messages);
      }
      logger.error({ user_id: user.id, error: error.message }, 'User update failed');
      return response.internalServerError({ message: 'La mise à jour a échoué', error: error.message });
    }
  }

  // --- DELETE ACCOUNT (Utilise le Middleware Hybride) ---
  async delete_account({ response, auth, session }: HttpContext) {
    // `auth.user` est garanti
    const user = await auth.authenticate() as UserWithToken
    const user_id = user.id

    interface UserWithToken extends User {
      currentAccessToken: AccessToken
    }

    try {
      const tokens = await User.accessTokens.all(user);
      for (const token of tokens) {
        await User.accessTokens.delete(user, token.identifier);
      }

      session.clear()

      // 3. Supprimer les tokens d'email, authentification, etc.
      await EmailVerificationToken.query().where('user_id', user_id).delete()
      await UserAuthentification.query().where('user_id', user_id).delete()

      // 4. Supprimer les relations (si nécessaire et non en cascade)
      // await user.related('userAddresses').query().delete()
      // await user.related('userPhones').query().delete()

      // 5. Supprimer l'utilisateur
      await user.delete()

      // 6. Log
      logger.info({ user_id }, 'User account deleted')

      return response.ok({ message: 'Compte supprimé avec succès' })

    } catch (error) {
      logger.error({ user_id, error: error.message }, 'Account deletion failed')
      return response.internalServerError({ message: 'Échec de la suppression du compte' })
    }
  }

  // --- GOOGLE AUTH (Placeholder - Initié par s_server) ---
  async google_auth({ ally }: HttpContext) {
    // Cette route ne devrait probablement pas être appelée directement par le client final
    // Elle pourrait être utilisée si le frontend appelle s_api pour *initier* le redirect
    // Mais selon notre discussion, c'est s_server qui initie.
    // return ally.use('google').redirect() // Exemple si s_api initiait

    // Pour l'instant, on ne fait rien ici car s_server initie.
    return { message: 'Google auth initiated by s_server' }
  }

  // // --- INTERNAL SOCIAL CALLBACK (Appelé par s_server) ---
  // async handleSocialCallbackInternal({ request, response }: HttpContext) {
  //   // !!! CETTE ROUTE DOIT ÊTRE SÉCURISÉE (appel interne seulement) !!!
  //   // Ajouter un middleware pour vérifier un token interne, une IP, etc.

  //   const socialData = request.body(); // Récupérer les données envoyées par s_server

  //   // Valider les données reçues (très important !)
  //   // Exemple simple, à adapter :
  //   if (!socialData || !socialData.provider || !socialData.providerId || !socialData.email) {
  //     logger.error({ receivedData: socialData }, 'Invalid data received on internal social callback');
  //     return response.badRequest('Invalid social data received from s_server');
  //   }

  //   try {
  //     let user: User | null = null;

  //     // 1. Chercher si l'utilisateur existe déjà via Provider ID
  //     const authEntry = await UserAuthentification.query()
  //       .where('provider', socialData.provider)
  //       .where('provider_id', socialData.providerId)
  //       .preload('user')
  //       .first();

  //     if (authEntry) {
  //       user = authEntry.user;
  //       logger.info({ user_id: user.id, provider: socialData.provider }, 'Existing user found via social provider');
  //       // Mettre à jour les infos (nom, photo?) si nécessaire
  //       // user.full_name = socialData.fullName ?? user.full_name;
  //       // user.photos = [socialData.avatarUrl] ?? user.photos;
  //       // await user.save();
  //     } else {
  //       // 2. Si pas trouvé par provider, chercher par email
  //       user = await User.findBy('email', socialData.email);
  //       if (user) {
  //         logger.info({ user_id: user.id, email: user.email }, 'Existing user found via email, linking social provider');
  //         // Lier le compte social à l'utilisateur existant
  //         await UserAuthentification.create({
  //           id: uuidv4(),
  //           user_id: user.id,
  //           provider: socialData.provider,
  //           provider_id: socialData.providerId,
  //         });
  //         // Marquer l'email comme vérifié si authentifié via social ? (bonne pratique)
  //         if (!user.isEmailVerified) {
  //           user.email_verified_at = DateTime.now();
  //           await user.save();
  //           logger.info({ user_id: user.id }, 'Email marked as verified via social login');
  //         }
  //       } else {
  //         // 3. Si pas trouvé du tout, créer un nouvel utilisateur
  //         logger.info({ email: socialData.email, provider: socialData.provider }, 'Creating new user from social login');
  //         user = await User.create({
  //           id: uuidv4(),
  //           full_name: socialData.fullName ?? `User_${string.random(5)}`, // Nom par défaut si non fourni
  //           email: socialData.email,
  //           password: string.random(32), // Générer un mot de passe aléatoire (non utilisable pour login email/pass)
  //           // photos: [socialData.avatarUrl],
  //           email_verified_at: DateTime.now(), // Considérer vérifié car vient d'un provider social
  //         });
  //         // Créer l'entrée UserAuthentification
  //         await UserAuthentification.create({
  //           id: uuidv4(),
  //           user_id: user.id,
  //           provider: socialData.provider,
  //           provider_id: socialData.providerId,
  //         });
  //       }
  //     }

  //     // 4. Générer le token d'accès API pour cet utilisateur
  //     const token = await User.accessTokens.create(user, ['*'], {
  //       name: `social_login_${socialData.provider}_${user.id}`,
  //       expiresIn: '30 days'
  //     });
  //     logger.info({ user_id: user.id }, 'API token generated for social login user');

  //     // 5. Renvoyer le token à s_server
  //     return response.ok({
  //       token: token.value!.release(),
  //       expires_at: token.expiresAt?.toISOString()
  //     });

  //   } catch (error) {
  //     logger.error({ socialData, error: error.message }, 'Failed to handle internal social callback');
  //     return response.internalServerError({ message: 'Failed to process social login' });
  //   }
  // }

}

// N'oublie pas d'exporter `export default new AuthController()` si ce n'est pas le cas