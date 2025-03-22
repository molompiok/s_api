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
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => CartItem, {
    foreignKey: 'cart_id',
    localKey: 'id',
  })
  declare items: HasMany<typeof CartItem>
}