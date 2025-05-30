// s_api/app/middleware/auth_middleware.ts
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'
import JwtService from '#services/JwtService' // Assure-toi que ce service existe dans s_api et n'utilise que la clé publique
import User from '#models/user' // Le modèle User de s_api
import { Bouncer } from '@adonisjs/bouncer' // Importer Bouncer
import { policies } from '#policies/main'    // Importer tes policies
import * as abilities from '#abilities/main' // Importer tes abilities

// Interface pour le payload attendu du JWT de s_server
interface ServerJwtPayload {
  userId: string;
  email: string;
  // roles_globaux?: string[]; // Si tu l'inclus
  sub: string; // Standard JWT subject, devrait être userId
  iss: string; // Issuer
  aud: string; // Audience
  iat: number; // Issued at
  exp: number; // Expiration time
}

export default class AuthMiddleware {
  // redirectTo = '/login' // Probablement pas pertinent pour s_api si elle ne sert que du JSON

  async handle(
    ctx: HttpContext,
    next: NextFn,
    _options: {
      guards?: (keyof Authenticators)[] // Guards AdonisJS standards
    } = {}
  ) {
    let isAuthenticated = false;
    let authUser: User | null = null;
    let authGuardName: string = '';

    // 1. Essayer de valider le JWT de s_server
    const authHeader = ctx.request.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const payload = JwtService.verify<ServerJwtPayload>(token); // Utilise ton JwtService de s_api (avec clé publique)

        // Vérifications optionnelles mais recommandées du payload
        if (payload.iss !== 'https://server.sublymus.com') { // Vérifie l'issuer
          throw new Error('Invalid JWT issuer');
        }
        // if (payload.aud !== 'AUDIENCE_ATTENDUE_PAR_S_API') { // Vérifie l'audience si tu en as une spécifique pour s_api
        //   throw new Error('Invalid JWT audience');
        // }

        // Charger l'utilisateur (Owner/Collaborator) à partir de la DB de s_api
        // Cet utilisateur doit exister dans s_api s'il est un collaborateur avec des permissions.
        // Si c'est un Owner qui n'est pas explicitement collaborateur d'un store mais a un accès "super-admin",
        // la logique Bouncer devra gérer cela.
        const userFromJwt = await User.find(payload.userId); // Ou payload.sub

        if (userFromJwt) {
          authUser = userFromJwt;
          isAuthenticated = true;
          authGuardName = 'jwt_s_server'; // Nom fictif pour ce type d'auth
          ctx.logger.info({ userId: authUser.id, guard: authGuardName }, 'User authenticated via s_server JWT');
        } else {
          // L'utilisateur du JWT n'existe pas dans la DB de s_api.
          // Cela peut être ok si c'est un Owner global et que Bouncer gère les permissions sans User local.
          // Ou cela peut être une erreur si un collaborateur est attendu.
          // Pour l'instant, on considère l'identité comme vérifiée tranchera.
          // On crée un objet utilisateur "partiel" pour Bouncer.

          authUser = { id: payload.userId, email: payload.email } as any // Cast pour l'exemple
          isAuthenticated = true;
          authGuardName = 'jwt_s_server';
          ctx.logger.info({ userId: payload.userId, guard: authGuardName }, 'Identity from s_server JWT validated (partial user object)');
        }

      } catch (jwtError) {
        ctx.logger.warn({ error: jwtError.message }, 's_server JWT validation failed or token missing/invalid');
        // Ne pas rejeter ici, on va essayer les autres guards
      }
    }

    // 2. Si non authentifié par JWT, essayer les guards AdonisJS standards (pour les clients du store)
    if (!isAuthenticated) {
      const adonisGuards = _options.guards ?? ['api', 'web']; // 'api' pour les tokens clients, 'web' pour session client
      for (const guardName of adonisGuards) {
        try {
          if (await ctx.auth.use(guardName).check()) {
            await ctx.auth.use(guardName).authenticate();
            authUser = ctx.auth.user!; // ctx.auth.user est maintenant défini
            isAuthenticated = true;
            authGuardName = guardName;
            ctx.logger.info({ userId: authUser.id, guard: authGuardName }, 'User authenticated via Adonis guard');
            break;
          }
        } catch (guardError) {
          ctx.logger.trace({ guard: guardName, error: guardError.message }, 'Adonis guard authentication failed, trying next');
        }
      }
    }

    // 3. Vérifier si l'authentification a réussi
    if (!isAuthenticated || !authUser) {
      // Redirection HTML non pertinente pour une API
      // if (ctx.request.accepts(['html'])) {
      //   return ctx.response.redirect(this.redirectTo)
      // }
      return ctx.response.unauthorized({ message: 'Unauthorized access' });
    }

    // 4. Attribuer l'utilisateur authentifié à ctx.auth.user pour que le reste de l'app (et Bouncer) y accède
    // Si un guard Adonis a réussi, ctx.auth.user est déjà défini.
    // Si notre validation JWT a réussi, nous devons le définir manuellement.
    if (authGuardName.startsWith('jwt_s_server') && authUser) {
      //@ts-ignore
      ctx.auth.user = authUser;  //
    }

    // 5. Initialiser Bouncer (DOIT être fait APRÈS que ctx.auth.user est potentiellement défini)
    ctx.bouncer = new Bouncer(
      () => ctx.auth.user || null, // Bouncer utilisera l'utilisateur que nous avons authentifié
      abilities, // Tes abilities pour s_api
      policies   // Tes policies pour s_api
    ).setContainerResolver(ctx.containerResolver);

    if ('view' in ctx) {
      // @ts-ignore
      ctx.view.share(ctx.bouncer.edgeHelpers);
    }

    await next();
  }
}