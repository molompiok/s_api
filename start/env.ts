/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string(),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  DB_HOST: Env.schema.string(),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),

  STORE_ID: Env.schema.string(),
  OWNER_ID: Env.schema.string(),
  
  /*
  |----------------------------------------------------------
  | Variables for Server Api
  |----------------------------------------------------------
  */

  INTERNAL_API_SECRET: Env.schema.string(),
  FILE_STORAGE_PATH: Env.schema.string(),
  FILE_STORAGE_URL: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring session package
  |----------------------------------------------------------
  */
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory'] as const),
  /*
|----------------------------------------------------------
| Redis configuration
|----------------------------------------------------------
*/
  REDIS_HOST: Env.schema.string(),
  REDIS_PORT: Env.schema.number(),
  REDIS_PASSWORD: Env.schema.string.optional(),
  /*
  |----------------------------------------------------------
  | JWT Validation
  |----------------------------------------------------------
  */
  S_SECRET_KEYS_CONTAINER_PATH: Env.schema.string(),

  SERVER_DOMAINE: Env.schema.string(),
/*
  |----------------------------------------------------------
  | WEB-PUSH Notification
  |----------------------------------------------------------
  */
  VAPID_PUBLIC_KEY: Env.schema.string(),
  VAPID_PRIVATE_KEY: Env.schema.string(),
  VAPID_SUBJECT: Env.schema.string(),
})
