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
  declare type: string 

  @column({
    prepare: (value) => JSON.stringify(value),
  })
  declare icon: string[]

  @column()
  declare required: boolean

  @column()
  declare default: string | null

  @hasMany(() => Value, { foreignKey: 'feature_id' })
  declare values: HasMany<typeof Value>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
