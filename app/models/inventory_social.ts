import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class InventorySocial extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare inventory_id: string

  @column()
  declare name: string

  @column()
  declare icon: string
  
  @column()
  declare url: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}