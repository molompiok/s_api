// s_api/app/models/email_verification_token.ts

import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user' // Importer le modèle User
import { v4 as uuidv4 } from 'uuid' // Si tu génères l'ID dans le code
import { beforeCreate } from '@adonisjs/lucid/orm'

export default class EmailVerificationToken extends BaseModel {
  // Assigner l'ID manuellement si la DB ne le fait pas
  @beforeCreate()
  public static assignUuid(token: EmailVerificationToken) {
    if (!token.id) { // Seulement si l'ID n'est pas déjà défini (ex: par la DB)
      token.id = uuidv4()
    }
  }

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_id: string 

  @column()
  declare token: string

  @column.dateTime()
  declare expires_at: DateTime

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}