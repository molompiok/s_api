// app/services/SecurityService.ts
import { type HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import { Exception } from '@adonisjs/core/exceptions'
import redisService from './RedisService.js'
import JwtService from './JwtService.js';
import User from '#models/user';

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
    let user;

    // console.log('request.authorization', request.headers()['authorization']);

    try {
      user = await this.authenticateJWT(request);
      (user as any).connection = 'jwt';
    } catch { }
    try {
      if (!user) {
        user = await auth.use('web').authenticate();
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
    console.log({ payload });

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
    let user;
    try {
      user = await User.query().where('email', payload.email).preload('roles').first();
      console.log(user?.$attributes);
      
      if (!user && payload.userId == env.get('OWNER_ID')) {
        user = await User.create({
          email: payload.email,
          id: payload.userId,
          email_verified_at: DateTime.now(),
          full_name: payload.full_name || 'Propriétaire',
          password: v4()
        })
      }
    } catch (error) {
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
