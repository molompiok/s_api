// contracts/context.ts
declare module '@adonisjs/core/http' {
    interface HttpContext {
      requestedLocale: string
    }
  }