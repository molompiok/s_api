import { DateTime } from 'luxon'
import { column, belongsTo } from '@adonisjs/lucid/orm'
import BaseModel from './base_model.js';
import type { BelongsTo } from '@adonisjs/lucid/types/relations';
import GroupProduct from './group_product.js';
import UserOrder, { OrderStatus } from '#models/user_order';
export default class UserOrderItem extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare store_id: string
  
  @column()
  declare user_id: string

  @column()
  declare order_id: string

  @column()
  declare status: OrderStatus

  // @column()
  // declare group_product_id: string

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
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  @belongsTo(() => GroupProduct, { foreignKey: 'group_product_id',localKey: 'id', })
  declare group_product: BelongsTo<typeof GroupProduct>

  @belongsTo(() => UserOrder, { foreignKey: 'order_id',localKey: 'id', })
  declare order: BelongsTo<typeof UserOrder>
}