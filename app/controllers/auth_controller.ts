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

export default class AuthController {

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
        logger.warn({ userId: user.id, email: user.email }, 'Login attempt with unverified email');
        // Optionnel : Peut-être renvoyer l'email de vérification ici ?
        // await this.sendVerificationEmail(user); // Méthode helper à créer
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

      logger.info({ userId: user.id }, 'User logged in successfully via API token');

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
      logger.info({ userId: user.id, email: user.email }, 'User created');

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
        userId: user.id
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
    logger.info({ userId: user.id, tokenId: verificationToken.id }, 'Email verification token created');

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
         logger.info({ userId: user.id, email: user.email }, 'Verification email job sent to s_server');
    } catch (queueError) {
         logger.error({ userId: user.id, error: queueError.message }, 'Failed to send verification email job');
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
           logger.info({ userId: user.id }, 'Email already verified');
           // Supprimer le token quand même
           await verificationToken.delete();
          return response.ok({ message: 'Votre email est déjà vérifié.' });
      }

      // Mettre à jour l'utilisateur et supprimer le token
      try {
          user.email_verified_at = DateTime.now();
          await user.save();
          await verificationToken.delete();
          logger.info({ userId: user.id }, 'Email successfully verified');

          // Que faire ensuite ? Rediriger vers le login ? Renvoyer un message de succès ?
          // Pour une API, renvoyer un message est souvent suffisant.
          return response.ok({ message: 'Email vérifié avec succès. Vous pouvez maintenant vous connecter.' });

      } catch (error) {
           logger.error({ userId: user.id, error: error.message }, 'Failed to update user verification status');
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
       logger.info({ userId: user.id }, 'Resend verification attempt for already verified email');
      return response.ok({ message: 'Votre email est déjà vérifié.' });
    }

    try {
      // Renvoyer l'email (la méthode helper invalide les anciens tokens)
      await this.sendVerificationEmail(user);
      return response.ok({ message: 'Un nouvel email de vérification a été envoyé.' });
    } catch (error) {
       logger.error({ userId: user.id, error: error.message }, 'Failed to resend verification email');
      return response.internalServerError({ message: 'Erreur lors du renvoi de l\'email.' });
    }
  }

  // --- LOGOUT (API Token + Web Session) ---
  public async logout({ auth, response }: HttpContext) {
    let loggedOutApi = false;
    let loggedOutWeb = false;

    try {
      // Essayer d'invalider le token API (si l'utilisateur est authentifié via API)
      // L'accès au token ID dépend de comment le middleware charge les infos.
      // Adonis met souvent l'info dans auth.user?.$original?.currentAccessToken?.identifier
      // Ou on peut le faire manuellement si le middleware l'expose sur ctx.
      // Supposons que le middleware standard charge le token correctement :
      if (auth.use('api').isAuthenticated && auth.user) {
         // On récupère l'identifiant du token utilisé pour cette requête
         const currentAccessToken = auth.user?.$original?.currentAccessToken
         if (currentAccessToken) {
             await User.accessTokens.delete(auth.user, currentAccessToken.identifier);
             loggedOutApi = true;
             logger.info({ userId: auth.user.id, tokenId: currentAccessToken.identifier }, 'API token logged out');
         }
      }
    } catch (error) {
      logger.warn({ userId: auth.user?.id, error: error.message }, 'Failed to logout API token (might not be API auth)');
    }

    try {
      // Essayer de fermer la session Web (si l'utilisateur est authentifié via Web)
      if (auth.use('web').isAuthenticated) {
        await auth.use('web').logout();
        loggedOutWeb = true;
         logger.info({ userId: auth.user?.id }, 'Web session logged out'); // Attention user peut être null ici
      }
    } catch (error) {
       logger.warn({ userId: auth.user?.id, error: error.message }, 'Failed to logout web session (might not be web auth)');
    }

    if (loggedOutApi || loggedOutWeb) {
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
    try {
        const user = auth.user!; // Utiliser '!' car le middleware garantit qu'il existe

        // Charger les relations comme avant
        await user.load((loader) => {
          loader
            .load('user_addresses')
            .load('user_phones')
        });

        const userData = {
          ...User.ParseUser(user.$attributes), // Assure-toi que ParseUser est statique ou accessible
          addresses: user.user_addresses.map(address => ({ /* ... */ })),
          phone_numbers: user.user_phones.map(phone => ({ /* ... */ }))
        };

        return response.ok({ user: userData });
    } catch (error) {
        // Cette erreur ne devrait pas être une erreur d'authentification ici
        // car le middleware l'aurait interceptée. Plutôt une erreur BDD ?
        logger.error({ userId: auth.user?.id, error: error.message }, 'Error fetching user details in /me');
        return response.internalServerError({ message: 'Erreur récupération informations utilisateur.' });
    }
  }

  // --- UPDATE USER (Utilise le Middleware Hybride) ---
  async update_user({ request, response, auth }: HttpContext) {
      // `auth.user` est garanti par le middleware
    const user = auth.user!;
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
        logger.info({ userId: user.id }, 'User profile updated');

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
       logger.error({ userId: user.id, error: error.message }, 'User update failed');
      return response.internalServerError({ message: 'La mise à jour a échoué', error: error.message });
    }
  }

  // --- DELETE ACCOUNT (Utilise le Middleware Hybride) ---
  async delete_account({ response, auth }: HttpContext) {
    // `auth.user` est garanti
    const user = auth.user!  as UserWithToken;
    const userId = user.id; // Sauvegarder l'ID pour les logs

    interface UserWithToken extends User {
      currentAccessToken: AccessToken
    }
    try {
      if(user.currentAccessToken){
        await User.accessTokens.delete(user, user.currentAccessToken.identifier); 
      }
      
      await EmailVerificationToken.query().where('user_id', userId).delete();

      await UserAuthentification.query().where('user_id', userId).delete();

      // 4. Supprimer les relations (adresses, etc.) si la DB ne le fait pas en cascade
      // await user.related('userAddresses').query().delete();
      // await user.related('userPhones').query().delete();


      await user.delete();
      logger.info({ userId }, 'User account deleted');

      // 6. Supprimer les fichiers associés (si nécessaire)
      // await deleteFiles(userId);

      return response.ok({ message: 'Compte supprimé avec succès' });

    } catch (error) {
       logger.error({ userId, error: error.message }, 'Account deletion failed');
      return response.internalServerError({ message: 'Échec de la suppression du compte' });
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

   // --- INTERNAL SOCIAL CALLBACK (Appelé par s_server) ---
   async handleSocialCallbackInternal({ request, response }: HttpContext) {
     // !!! CETTE ROUTE DOIT ÊTRE SÉCURISÉE (appel interne seulement) !!!
     // Ajouter un middleware pour vérifier un token interne, une IP, etc.

     const socialData = request.body(); // Récupérer les données envoyées par s_server

     // Valider les données reçues (très important !)
     // Exemple simple, à adapter :
     if (!socialData || !socialData.provider || !socialData.providerId || !socialData.email) {
       logger.error({ receivedData: socialData }, 'Invalid data received on internal social callback');
       return response.badRequest('Invalid social data received from s_server');
     }

     try {
       let user: User | null = null;

       // 1. Chercher si l'utilisateur existe déjà via Provider ID
       const authEntry = await UserAuthentification.query()
         .where('provider', socialData.provider)
         .where('provider_id', socialData.providerId)
         .preload('user')
         .first();

       if (authEntry) {
         user = authEntry.user;
         logger.info({ userId: user.id, provider: socialData.provider }, 'Existing user found via social provider');
         // Mettre à jour les infos (nom, photo?) si nécessaire
         // user.full_name = socialData.fullName ?? user.full_name;
         // user.photos = [socialData.avatarUrl] ?? user.photos;
         // await user.save();
       } else {
         // 2. Si pas trouvé par provider, chercher par email
         user = await User.findBy('email', socialData.email);
         if (user) {
           logger.info({ userId: user.id, email: user.email }, 'Existing user found via email, linking social provider');
           // Lier le compte social à l'utilisateur existant
           await UserAuthentification.create({
             id: uuidv4(),
             user_id: user.id,
             provider: socialData.provider,
             provider_id: socialData.providerId,
           });
           // Marquer l'email comme vérifié si authentifié via social ? (bonne pratique)
           if (!user.isEmailVerified) {
             user.email_verified_at = DateTime.now();
             await user.save();
              logger.info({ userId: user.id }, 'Email marked as verified via social login');
           }
         } else {
           // 3. Si pas trouvé du tout, créer un nouvel utilisateur
            logger.info({ email: socialData.email, provider: socialData.provider }, 'Creating new user from social login');
           user = await User.create({
             id: uuidv4(),
             full_name: socialData.fullName ?? `User_${string.random(5)}`, // Nom par défaut si non fourni
             email: socialData.email,
             password: string.random(32), // Générer un mot de passe aléatoire (non utilisable pour login email/pass)
             // photos: [socialData.avatarUrl],
             email_verified_at: DateTime.now(), // Considérer vérifié car vient d'un provider social
           });
           // Créer l'entrée UserAuthentification
           await UserAuthentification.create({
             id: uuidv4(),
             user_id: user.id,
             provider: socialData.provider,
             provider_id: socialData.providerId,
           });
         }
       }

       // 4. Générer le token d'accès API pour cet utilisateur
       const token = await User.accessTokens.create(user, ['*'], {
         name: `social_login_${socialData.provider}_${user.id}`,
         expiresIn: '30 days'
       });
       logger.info({ userId: user.id }, 'API token generated for social login user');

       // 5. Renvoyer le token à s_server
       return response.ok({
         token: token.value!.release(),
         expires_at: token.expiresAt?.toISOString()
       });

     } catch (error) {
        logger.error({ socialData, error: error.message }, 'Failed to handle internal social callback');
       return response.internalServerError({ message: 'Failed to process social login' });
     }
   }

}

// N'oublie pas d'exporter `export default new AuthController()` si ce n'est pas le cas