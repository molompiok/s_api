// app/services/SecurityService.ts
import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import { Exception } from '@adonisjs/core/exceptions'

export class SecurityService {
  public verifyInternalRequest(request: HttpContext['request']): void {
    console.log('SecurityService: Verifying internal request...') // Log de débogage

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

  // Vous pouvez ajouter d'autres fonctions liées à la sécurité ici si nécessaire
}

// Exporter une instance si vous préférez l'injection ou l'utilisation directe
// export default new SecurityService()
// Ou laisser comme classe pour l'injection via le conteneur IoC d'AdonisJS