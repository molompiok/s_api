import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type {  BelongsTo } from '@adonisjs/lucid/types/relations'
import Feature from './feature.js'

export default class Value extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column({ columnName: 'feature_id' })
  declare feature_id: string

  @column({
    prepare: (value) => JSON.stringify(value),
  })
  declare views: string[]
  
  @column()
  declare icon: string


  @column()
  declare text: string

  @column()
  declare key: string

  @column()
  declare stock: number

  @column()
  declare additional_price: number

  @column()
  declare currency: string

  @column()
  declare decreases_stock: boolean


  @column()
  declare continue_selling: boolean

  
  @column()
  declare index: number
  

  @belongsTo(() => Feature , { foreignKey: 'feature_id' })
  declare feature: BelongsTo<typeof Feature>

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}
