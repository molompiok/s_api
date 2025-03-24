import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import CartItem from './cart_item.js'
import type { HasMany } from '@adonisjs/lucid/types/relations';

export default class Cart extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_id: string


  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime
  
  @column.dateTime()
  declare expires_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  @hasMany(() => CartItem, {
    foreignKey: 'cart_id',
    localKey: 'id',
  })
  declare items: HasMany<typeof CartItem>

  public getTotal() {
    return this.items.reduce((sum, item) => {
      const itemPrice = (item.group_product.additional_price || 0) + (item.group_product.product?.price || 0)
      return sum + item.quantity * itemPrice
    }, 0)
  }
}