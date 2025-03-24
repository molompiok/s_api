import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class UserAuthentification extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_id: string

  @column()
  declare provider: 'google' | 'facebook' | 'email'

  @column()
  declare provider_id: string

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime
}