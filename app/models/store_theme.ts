import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

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