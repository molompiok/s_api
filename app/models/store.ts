import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Store extends BaseModel {
  @column({ isPrimary: true })
  declare id: string
  
  @column()
  declare user_id: string

  @column()
  declare name: string

  @column({
    prepare: (value) => JSON.stringify(value), 
    // consume: (value) => JSON.parse(value),
  })
  declare logo: string[]


  @column({
    prepare: (value) => JSON.stringify(value), 
    // consume: (value) => JSON.parse(value),
  })
  declare banner: string[]

  @column()
  declare description: string

  @column()
  declare url: string
  
  @column()
  declare current_theme_id: string
    
  @column()
  declare api_port: number

  @column.dateTime({})
  declare expire_at: DateTime

  @column()
  declare disk_storage_limit_gb: number


  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}