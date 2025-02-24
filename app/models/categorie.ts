import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Categorie extends BaseModel {
  @column({ isPrimary: true })
  declare id: string | null

  @column()
  declare store_id: string

  @column()
  declare parent_category_id: string

  @column()
  declare name: string

  @column()
  declare description: string

  @column()
  declare view: string

  @column()
  declare icon: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}