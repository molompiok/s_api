import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class UserCommand extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_id: string

  @column()
  declare reference: string

  @column()
  declare status: string

  @column()
  declare payment_method: string

  @column()
  declare payment_status: string

  @column()
  declare devise: string

  @column()
  declare total_price: number

  @column()
  declare price_delivery: number

  @column()
  declare price_return_delivery: number

  @column()
  declare with_delivery: boolean

  @column()
  declare phone_number_customer: string

  @column()
  declare format_number_customer: string

  @column()
  declare country_code_customer: string

  @column()
  declare delivery_address: string

  @column()
  declare delivery_date: string

  @column()
  declare pickup_address: string

  @column()
  declare pickup_date: string

  @column()
  declare longitude_delivery: number

  @column()
  declare latitude_delivery: number

  @column()
  declare latitude_pickup: number

  @column()
  declare longitude_pickup: number

  @column()
  declare pickup_address_name: string

  @column()
  declare delivery_address_name: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}