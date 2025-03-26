import { DateTime } from 'luxon'
import { column } from '@adonisjs/lucid/orm'
import BaseModel from './base_model.js';

export default class StoreTheme extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare store_id: string

  @column()
  declare theme_id: string

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}