import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Visite extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare user_id: string

  @column()
  declare ip_address: string

  @column()
  declare device_type: string

  @column()
  declare browser_name: string

  @column()
  declare browser_version: string

  @column()
  declare os_name: string

  @column()
  declare os_version: string

  @column()
  declare referrer: string | null

  @column()
  declare landing_page: string

  @column()
  declare session_duration: number | null

  @column()
  declare is_authenticate: boolean

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

}
