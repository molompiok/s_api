import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Feature extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare product_id: string

  @column()
  declare name: string

  @column()
  declare type: string // Text , Icon , Color , component , Date , Files , Input, Interval

  @column({
    prepare: (value) => JSON.stringify(value), 
    consume: (value) => JSON.parse(value),
  })
  declare icon: string[]

  @column()
  declare required: boolean

  @column()
  declare default: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}