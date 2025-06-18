// app/models/product_characteristic.ts
import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import Product from '#models/product'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class ProductCharacteristic extends BaseModel {
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare product_id: string

  @column()
  declare name: string

  @column({
    prepare: (value) => JSON.stringify(value),
  })
  declare icon: string[]

  @column()
  declare description: string | null

  @column()
  declare key: string | null

  @column()
  declare value_text: string | null // Valeur principale affichée

  @column()
  declare quantity: number | null // BigInt si besoin de très grande précision/valeurs

  @column()
  declare unity: string | null

  @column()
  declare level: number | null

  @column()
  declare index: number

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  // Relations
  @belongsTo(() => Product)
  declare product: BelongsTo<typeof Product>
}