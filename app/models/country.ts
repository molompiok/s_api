import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Country extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @column()
  declare format_number: string

  @column()
  declare length_number: string
  
  @column()
  declare lang: string

  @column()
  declare code: string

  @column()
  declare currency: string

  @column()
  declare flag: string

  @column()
  declare bound: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}