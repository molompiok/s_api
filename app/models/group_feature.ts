import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
export default class GroupFeature extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare product_id:string
  
  @column()
  declare additional_price: number

  @column()
  declare stock: number

  @column({ 
    serializeAs: 'bind',
    prepare: (value: Record<string, any> | null) => (value ? JSON.stringify(value) : null),
  })
  declare bind: Record<string, any> | null

  
  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime


}