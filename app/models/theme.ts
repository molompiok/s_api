import { DateTime } from 'luxon'
import { column } from '@adonisjs/lucid/orm'
import BaseModel from './base_model.js';

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
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}