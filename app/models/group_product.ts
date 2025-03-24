import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations';

import Product from './product.js'
export default class GroupProduct extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare product_id:string
  
  @column()
  declare currency: string 

  @column()
  declare additional_price: number

  @column()
  declare stock: number

  @column({ 
    serializeAs: 'bind',
    prepare: (value: Record<string, any> | null) => (value ? JSON.stringify(value) : null),
  })
  declare bind: Record<string, any> | null // {"ram": "16","taille": "XXL","couleur": "yellow"}

  @belongsTo(() => Product, {
    foreignKey: 'product_id', // Colonne dans GroupProduct
    localKey: 'id', // Colonne dans Product
  })
  declare product: BelongsTo<typeof Product>

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime


}