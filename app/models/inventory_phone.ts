import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class InventoryPhone extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare inventory_id: string

  @column()
  declare phone_number: string

  @column()
  declare format: string

  @column()
  declare country_code: string // ci_225

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}