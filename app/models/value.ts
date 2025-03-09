import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type {  BelongsTo } from '@adonisjs/lucid/types/relations'
import Feature from './feature.js'

export default class Value extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column({ columnName: 'feature_id' })
  declare feature_id: string

  @column()
  declare additional_price: number

  @column()
  declare currency: string 

  @column()
  declare icon: string

  @column({
    prepare: (value) => JSON.stringify(value),
  })
  declare views: string[]

  @column()
  declare text: string

  @column()
  declare min: number

  @column()
  declare max: number

  @column()
  declare index: number


  @column()
  declare min_size: number

  @column()
  declare max_size: number

  @column()
  declare multiple: boolean

  @column()
  declare is_double: boolean

  @belongsTo(() => Feature , { foreignKey: 'feature_id' })
  declare feature: BelongsTo<typeof Feature>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
