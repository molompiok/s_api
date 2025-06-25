// app/Middleware/LogOrigin.ts
import { HttpContext } from '@adonisjs/core/http'

export default class LogOrigin {
  public async handle({ request }: HttpContext, next: () => Promise<void>) {
    console.log('🌐 ORIGIN:', request.header('origin'))
    await next()
  }
}
