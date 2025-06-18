// app/models/product_faq.ts
import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import Product from '#models/product'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

// Interface pour la structure de 'sources'
export interface FaqSource {
  label: string;
  url: string;
}

export default class ProductFaq extends BaseModel {
  static selfAssignPrimaryKey = true // Si on utilise defaultTo(this.raw('uuid_generate_v4()'))

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare product_id: string

  @column()
  declare title: string

  @column()
  declare content: string

  @column({
    prepare: (value: FaqSource[] | undefined | null) => (value ? JSON.stringify(value) : null),
    // consume: (value: string | null) => (value ? JSON.parse(value) : null),
  })
  declare sources: FaqSource[] | null // Stocké en JSONB

  @column()
  declare group: string | null

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