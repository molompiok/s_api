import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import { OrderStatus } from './user_command.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations';
import GroupProduct from './group_product.js';
import type { HasMany } from '@adonisjs/lucid/types/relations';
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
  declare status: OrderStatus

  @column()
  declare group_product_id: string

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

  @hasMany(() => UserCommandItem, {
    foreignKey: 'commandId', 
    localKey: 'id', // Colonne dans UserCommand
  })
  declare items: HasMany<typeof UserCommandItem>
}