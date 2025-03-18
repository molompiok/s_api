import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class UserCommandItem extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare store_id: string
  
  @column()
  declare user_id: string

  @column()
  declare command_id: string

  @column()
  declare status: 'RETURN'

  @column()
  declare product_id: string

  @column()
  declare quantity: number

  @column()
  declare price_unit: number

  @column({
    prepare: (value) => JSON.stringify(value), 
    // consume: (value) => JSON.parse(value),
  })
  declare views: string[]

  @column()
  declare currency: string

  @column()
  declare features: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}