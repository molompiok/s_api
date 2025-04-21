import { DateTime } from 'luxon'
import { belongsTo, column } from '@adonisjs/lucid/orm'
import BaseModel from './base_model.js'; 
import User from './user.js';
import { type BelongsTo } from '@adonisjs/lucid/types/relations';

export default class Comment extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_id: string

  @column()
  declare product_id: string

  @column()
  declare bind_name: string
 
  @column()
  declare  order_item_id : string
 
  @column()
  declare order_id: string

  @column()
  declare title: string

  @column()
  declare description: string | null

  @column()
  declare rating: number

  @column({
    prepare: (value) => JSON.stringify(value), 
  })
  declare views: string[]

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

   @belongsTo(() => User, {
      foreignKey: 'user_id', // ✅ La clé étrangère doit être `user_id` dans `Order`
    })
    declare user: BelongsTo<typeof User>
  
}