import { DateTime } from 'luxon'
import { column, belongsTo } from '@adonisjs/lucid/orm'
import BaseModel from './base_model.js';
import type { BelongsTo } from '@adonisjs/lucid/types/relations';
import UserOrder, { OrderStatus } from '#models/user_order';
import Product from './product.js';
export default class UserOrderItem extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_id: string

  @column()
  declare order_id: string

  @column()
  declare status: OrderStatus

  @column()
  declare product_id: string //NEW

  
  @column()
  declare bind_name: string //NEW json
  
  @column()
  declare bind: string //NEW json

  @column()
  declare quantity: number

  @column()
  declare price_unit: number

  @column()
  declare currency: string

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  @belongsTo(() => Product, { foreignKey: 'product_id',localKey: 'id', })
  declare product: BelongsTo<typeof Product>

  @belongsTo(() => UserOrder, { foreignKey: 'order_id',localKey: 'id', })
  declare order: BelongsTo<typeof UserOrder>


  public getBind() {
    try {
      return JSON.parse(this.bind);
    } catch (error) {
      return {}
    }
  }

}