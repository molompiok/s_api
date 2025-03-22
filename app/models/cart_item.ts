import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import Cart from './cart.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations';
import GroupProduct from './group_product.js';
export default class CartItem extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare cart_id: string

  @column()
  declare group_product_id: string

  @column()
  declare quantity: number

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  @belongsTo(() => Cart, {
    foreignKey: 'cart_id',
    localKey: 'id',
  })
  declare cart: BelongsTo<typeof Cart>

  @belongsTo(() => GroupProduct,{
    foreignKey: 'group_product_id',
    localKey: 'id',
  })
  declare group_product: BelongsTo<typeof GroupProduct>
}