import { DateTime } from 'luxon'
import { column, hasMany } from '@adonisjs/lucid/orm'
import CartItem from './cart_item.js'
import type { HasMany } from '@adonisjs/lucid/types/relations';
import BaseModel from './base_model.js';
import { TransactionClientContract } from '@adonisjs/lucid/types/database';
import logger from '@adonisjs/core/services/logger';

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

   public async getTotal( _trx?: TransactionClientContract) {
    let sum = 0;
    for (const item of this.items) {
      const product  = item.product
      const option  = await CartItem.getBindOptionFrom(item.getBind(),product)
      logger.info(option,"Cart getTotal");
      const itemPrice = (option?.additional_price || 0) + (product?.price || 0)
      sum += item.quantity * itemPrice
    }
    return sum
  }
}