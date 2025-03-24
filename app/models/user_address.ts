import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

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