import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Detail extends BaseModel {
  @column({ isPrimary: true })
  declare id: string
  @column()
  declare product_id: string;
  
  @column()
  declare title?: string;
  
  @column()
  declare description?: string;
  
  @column({
    prepare: (value: any) => {
      if (typeof value !== 'string') {
        return JSON.stringify(value)
      }
      return value
    }
  })
  declare view?: string[];
  
  @column()
  declare index: number
  
  @column()
  declare type?:string;
  
  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}