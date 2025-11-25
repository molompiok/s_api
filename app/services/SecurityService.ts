// app/services/SecurityService.ts
import { type HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import { Exception } from '@adonisjs/core/exceptions'
import redisService from './RedisService.js'
import JwtService from './JwtService.js';
import User from '#models/user';
import logger from '@adonisjs/core/services/logger';
import db from '@adonisjs/lucid/services/db';

import { policies } from '#policies/main'
import * as abilities from '#abilities/main'

import { Bouncer } from '@adonisjs/bouncer'
import { v4 } from 'uuid';
import { DateTime } from 'luxon';

interface ServerJwtPayload {
  userId: string;
  email: string;
  full_name?: string,
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}
export class SecurityService {
  public verifyInternalRequest(request: HttpContext['request']): void {
    // console.log('SecurityService: Verifying internal request...') // Log de débogage

    const receivedSecret = request.header('X-Internal-Secret')
    const expectedSecret = env.get('INTERNAL_API_SECRET')

    if (!expectedSecret) {
      console.error('SecurityService: INTERNAL_API_SECRET env variable not set!')
      throw new Exception('Internal server configuration error', { code: 'E_CONFIG_ERROR', status: 500 })
    }
    if (!receivedSecret) {
      console.log('SecurityService: Secret header missing')
      throw new Exception('Missing internal secret header', { code: 'E_UNAUTHORIZED', status: 401 })
    }

    if (receivedSecret !== expectedSecret) {
      console.log('SecurityService: Invalid secret received')
      throw new Exception('Invalid internal secret', { code: 'E_UNAUTHORIZED', status: 401 })
    }
    console.log('SecurityService: Internal request verified successfully.')
  }

  async authenticate({ auth, request }: { response?: HttpContext['response'], auth: HttpContext['auth'], request: HttpContext['request'] }) {
    let user = auth.user;

    // console.log('request.authorization', request.headers()['authorization']);

    try {
      if (!user) {
        user = await this.authenticateJWT(request);
        (user as any).connection = 'jwt';
        Object.defineProperty(auth, 'authenticatedViaGuard', {
          value: 'jwt',
          writable: false,
        });
      }
    } catch { }
    try {
      if (!user) {
        user = await auth.use('api').authenticate();
        // if (convert = 'to-web') {
        //   console.log(auth.use('web').login(user));
        // }
      }
    } catch (error) {
      console.log({ authError: error });
    }
    try {
      if (!user) {
        user = await auth.use('web').authenticate();
      }
    } catch { }
    

    if (!user) throw new Exception('Unauthorized access', { code: 'E_UNAUTHORIZED', status: 401 })

    if (request.ctx) {
      const ctx = request.ctx;

      //@ts-ignore
      Object.defineProperty(ctx.auth, 'user', {
        value: user,
        writable: false,
      });

      Object.defineProperty(ctx, 'bouncer', {
        value: new Bouncer(
          () => ctx.auth.user || null,
          abilities,
          policies
        ).setContainerResolver(ctx.containerResolver),
        writable: true,
        configurable: true,
        enumerable: true
      });
    }
    // if (convert = 'to-web') {
    //   console.log(auth.use('web'));
    // }
    return user
  }

  /**
   * Trouve ou crée le owner de manière idempotente.
   * Gère proprement les race conditions lors de créations parallèles.
   */
  private async findOrCreateOwner(payload: ServerJwtPayload): Promise<User> {
    const ownerId = env.get('OWNER_ID');
    
    // Si ce n'est pas le owner, ne pas créer
    if (payload.userId !== ownerId) {
      throw new Error('This method should only be called for owner creation');
    }

    // Tentative 1: Chercher d'abord sans transaction (cas le plus fréquent)
    let user = await User.query()
      .where('email', payload.email)
      .preload('roles')
      .first();

    if (user) {
      return user;
    }

    // Tentative 2: Créer avec transaction pour gérer les race conditions
    const trx = await db.transaction();
    try {
      // Re-vérifier dans la transaction (pour éviter les créations parallèles)
      user = await User.query({ client: trx })
        .where('email', payload.email)
        .preload('roles')
        .first();

      if (user) {
        await trx.rollback();
        return user;
      }

      // Créer le user dans la transaction
      user = await User.create({
        email: payload.email,
        id: payload.userId,
        email_verified_at: DateTime.now(),
        full_name: payload.full_name || 'Propriétaire',
        password: v4()
      }, { client: trx });

      await trx.commit();
      logger.info({ userId: user.id, email: user.email }, 'Owner user created successfully');
      return user;

    } catch (error: any) {
      await trx.rollback();
      
      // Si erreur de duplicate (race condition), récupérer le user existant
      if (this.isDuplicateEntryError(error)) {
        logger.debug({ userId: payload.userId, email: payload.email }, 'Race condition: owner already created, fetching from DB');
        user = await User.query()
          .where('email', payload.email)
          .preload('roles')
          .first();
        
        if (user) {
          return user;
        }
        // Si toujours pas trouvé, c'est un vrai problème
        logger.error({ userId: payload.userId, email: payload.email, error }, 'Owner creation failed: duplicate entry but user not found');
        throw new Error('Owner creation failed: duplicate entry but user not found');
      }
      
      // Autre erreur, la propager
      logger.error({ userId: payload.userId, email: payload.email, error }, 'Failed to create owner user');
      throw error;
    }
  }

  /**
   * Vérifie si une erreur est une erreur de contrainte unique (duplicate entry)
   */
  private isDuplicateEntryError(error: any): boolean {
    if (!error) return false;
    
    // Codes d'erreur MySQL
    if (error.code === 'ER_DUP_ENTRY') return true;
    
    // Codes d'erreur PostgreSQL
    if (error.code === '23505') return true;
    
    // Messages d'erreur communs
    const errorMessage = String(error.message || '').toLowerCase();
    if (errorMessage.includes('duplicate entry')) return true;
    if (errorMessage.includes('unique constraint')) return true;
    if (errorMessage.includes('duplicate key')) return true;
    
    return false;
  }

  async authenticateJWT(request: HttpContext['request']) {
    const authHeader = request.header('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // console.log({ authHeader });

      throw new Error('Unauthorized access')
    }

    const token = authHeader.replace('Bearer ', '').trim()
    // console.log({ token });

    const isBlacklisted = await redisService.getCache(`jwt_blacklist:${token}`)
    // console.log({ isBlacklisted });

    if (isBlacklisted) {
      throw new Error('Token has been revoked')
    }

    let payload: ServerJwtPayload
    try {
      payload = JwtService.decode(token) as any
    } catch {
      throw new Error('Invalid or expired token')
    }
    if (!payload || typeof payload !== 'object' || !payload.userId) {
      throw new Error('Invalid token payload')
    }

    const revoked_date = await redisService.getCache(`revoked_all_token_at:${payload.userId}`);

    // console.log({ payload, env: env.get('OWNER_ID') }, payload.iat, revoked_date, payload.iat < revoked_date, Date.now());

    if (payload.iat < (revoked_date || 0)) {
      // console.log('REVOKED TOKEN, ');
      // console.log('REVOKED TOKEN (issued before global revocation)');
      throw new Error('Token has been revoked globally');
    }
    
    let user: User | null = null;
    
    try {
      // Chercher l'utilisateur existant
      user = await User.query()
        .where('email', payload.email)
        .preload('roles')
        .first();

      // Si pas trouvé et que c'est le owner, créer avec gestion de race condition
      if (!user && payload.userId === env.get('OWNER_ID')) {
        user = await this.findOrCreateOwner(payload);
      }
    } catch (error: any) {
      logger.error({ userId: payload.userId, email: payload.email, error }, 'Failed to authenticate user from JWT');
      throw new Error('User not found for token, loading error');
    }

    if (!user) {
      throw new Error('User not found for token');
    }

    if (!user.roles?.length) {
      if (user.id !== env.get('OWNER_ID')) throw new Error('Role not found for user');
    }

    if (!user.email_verified_at) {
      user.email_verified_at = DateTime.now();
      await user.save();
    }
    return user
  }
}

const securityService = new SecurityService();
export { securityService }
