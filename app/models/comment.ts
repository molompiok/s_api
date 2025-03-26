import { DateTime } from 'luxon'
import { column } from '@adonisjs/lucid/orm'
import BaseModel from './base_model.js'; 

export default class Comment extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_id: string

  @column()
  declare product_id: string

  @column()
  declare title: string

  @column()
  declare description: string

  @column()
  declare rating: number

  @column({
    prepare: (value) => JSON.stringify(value), 
    // consume: (value) => JSON.parse(value),
  })
  declare views: string[]

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}