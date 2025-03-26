import { DateTime } from 'luxon'
import { column } from '@adonisjs/lucid/orm'
import BaseModel from './base_model.js';

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