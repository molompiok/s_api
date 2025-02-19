import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Theme extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare port: number

  @column()
  declare primary_port: number

  @column()
  declare dir: string

  @column()
  declare cmd_start: string

  @column()
  declare cmd_stop: string

  @column()
  declare cmd_restart: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}