import transmit from '@adonisjs/transmit/services/main'
import type { HttpContext } from '@adonisjs/core/http'

transmit.authorize<{ id: string }>('test:sse', (ctx: HttpContext, { id }) => {
  // Vérifie que l'utilisateur a le droit d'écouter ce canal

  console.log({id});
  
  return true//ctx.auth.user?.id === id // Exemple : seul l'utilisateur avec cet ID peut écouter
})