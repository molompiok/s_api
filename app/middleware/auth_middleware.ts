import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'

export default class AuthMiddleware {
  redirectTo = '/login'  //TODO tous les theme doivent implemnter le chemin /login

  async handle(
    ctx: HttpContext,
    next: NextFn,
    _options: {
      guards?: (keyof Authenticators)[]
    } = {}
  ) {
    // await ctx.auth.authenticateUsing(options.guards, { loginRoute: this.redirectTo })
    const tryAuth = async (guard: keyof Authenticators) => {
      try {
        if (await ctx.auth.use(guard).check()) {
          await ctx.auth.use(guard).authenticate()
          return true
        }
      } catch (_) { }
      return false
    }

    const guards = _options.guards ?? ['api', 'web']

    let isAuthenticated = false

    try {

      for (const guard of guards) {
        if (await tryAuth(guard)) {
          isAuthenticated = true
          break
        }
      }
    } catch (error) {
      return ctx.response.unauthorized({ message: 'Unauthorized access' })
    }

    if (!isAuthenticated) {
      if (ctx.request.accepts(['html'])) {
        return ctx.response.redirect(this.redirectTo)
      }

      return ctx.response.unauthorized({ message: 'Unauthorized access' })
    }

    await next()
  }
}