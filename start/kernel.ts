/*
|--------------------------------------------------------------------------
| HTTP kernel file
|--------------------------------------------------------------------------
|
| The HTTP kernel file is used to register the middleware with the server
| or the router.
|
*/

import router from '@adonisjs/core/services/router'
import server from '@adonisjs/core/services/server'
import './lucid.js'
import { Ignitor } from '@adonisjs/core'
import { startScheduler } from './scheduler.js'
import { createServer } from 'node:http'

/**
 * The error handler is used to convert an exception
 * to a HTTP response.
 */
server.errorHandler(() => import('#exceptions/handler'))

/**
 * The server middleware stack runs middleware on all the HTTP
 * requests, even if there is no route registered for
 * the request URL.
 */
server.use([
  () => import('#middleware/container_bindings_middleware'),
  () => import('#middleware/force_json_response_middleware'),
  () => import('@adonisjs/cors/cors_middleware'),
])

/**
 * The router middleware stack runs middleware on all the HTTP
 * requests with a registered route.
 */
router.use([() => import('@adonisjs/core/bodyparser_middleware'), () => import('@adonisjs/auth/initialize_auth_middleware'), () => import('@adonisjs/session/session_middleware')])

/**
 * Named middleware collection must be explicitly assigned to
 * the routes or the routes group.
 */
export const middleware = router.named({
  auth: () => import('#middleware/auth_middleware'),
})

startScheduler()

// BaseModel.boot() // Assure-toi que le modèle est bien chargé

// console.log('Feature Relations:', Feature.$relationsDefinitions)
// console.log('Value Relations:', Value.$relationsDefinitions)
