import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Inventory extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare store_id: string

  @column()
  declare address_name: string

  @column()
  declare email: string

  @column()
  declare latitude: number

  @column()
  declare longitude: number

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}