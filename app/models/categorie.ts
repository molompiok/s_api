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


  @column({
    prepare: (value) => JSON.stringify(value), // Convertit en JSON avant d'insérer
    consume: (value) => JSON.parse(value), // Convertit en tableau après récupération
  })
  declare view: string[]


  @column({
    prepare: (value) => JSON.stringify(value), 
    consume: (value) => JSON.parse(value),
  })
  declare icon: string[]


  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}