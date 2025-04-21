import { DateTime } from 'luxon'
import { belongsTo, column } from '@adonisjs/lucid/orm'
import BaseModel from './base_model.js';
import Product from './product.js';
import { type BelongsTo } from '@adonisjs/lucid/types/relations';

export default class Favorite extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_id: string

  @column()
  declare label: string

  @column()
  declare product_id: string

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

   @belongsTo(() => Product, {
      foreignKey: 'product_id',
      localKey: 'id',
    })
    declare product: BelongsTo<typeof Product>
}