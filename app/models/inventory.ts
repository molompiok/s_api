import { DateTime } from 'luxon'
import { column } from '@adonisjs/lucid/orm'
import BaseModel from './base_model.js';

export default class Inventory extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

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