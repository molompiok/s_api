import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Value extends BaseModel {
  @column({ isPrimary: true })
  declare value_id: string

  @column()
  declare feature_id: string

  @column()
  declare product_id: string

  @column()
  declare additional_price: number

  @column()
  declare devise: string 

  @column()
  declare type: string // Text , Icon , Color , component , Date , Files , Input, Interval

  @column()
  declare icon: string
  
  @column()
  declare text: string
    
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

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}