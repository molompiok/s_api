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
  declare index: number
  

  @belongsTo(() => Feature , { foreignKey: 'feature_id' })
  declare feature: BelongsTo<typeof Feature>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
