import { DateTime } from 'luxon'
import { BaseModel, column, hasMany} from '@adonisjs/lucid/orm'
import {  type HasMany } from '@adonisjs/lucid/types/relations'
import Value from './value.js'

export default class Feature extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare product_id: string

  @column()
  declare name: string

  @column()
  declare type: FeaturType 

  @column({
    prepare: (value) => JSON.stringify(value),
  })
  declare icon: string[]

  @column()
  declare required: boolean

  @column()
  declare default_value: string | null

  @column()
  declare regex: string
    
  @column()
  declare index: number
  
  @column()
  declare min: number

  @column()
  declare max: number

  @column()
  declare min_size: number

  @column()
  declare max_size: number

  @column()
  declare multiple: boolean

  @column()
  declare is_double: boolean

  @hasMany(() => Value, { foreignKey: 'feature_id' })
  declare values: HasMany<typeof Value>

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}


export enum FeaturType {

  ICON_TEXT = 'icon_text',
  COLOR = 'color',
  TEXT = 'text',
  ICON = 'icon',
  INPUT = 'input',
  DATE ='date',
  DOUBLE_DATE ='double_date',
  RANGE = 'range',
  LEVEL='level',
  FILE = ' file',
}
