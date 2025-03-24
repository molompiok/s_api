import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class ProductFavorite extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare product_id: string

  @column()
  declare user_id: string

  @column()
  declare favorite_id: string

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}