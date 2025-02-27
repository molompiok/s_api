import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class GroupFeature extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare product_id:string

  @column()
  declare stock: number

  @column()
  declare bind:string

  
  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}