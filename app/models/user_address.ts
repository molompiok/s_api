import { DateTime } from 'luxon'
import { column } from '@adonisjs/lucid/orm'
import BaseModel from './base_model.js';

export default class UserAddress extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_id: string

  @column()
  declare name: string

  @column()
  declare longitude: number

  @column()
  declare latitude: number
  
  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}