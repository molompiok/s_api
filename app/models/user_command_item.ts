import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class UserCommandItem extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_command_id: string

  @column()
  declare product_id: string

  @column()
  declare quantity: number

  @column()
  declare price_unit: number

  @column()
  declare devise: string

  @column()
  declare features: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}