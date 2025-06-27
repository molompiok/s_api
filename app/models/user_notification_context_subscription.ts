import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, beforeCreate } from '@adonisjs/lucid/orm'
import User from '#models/user'
import UserBrowserSubscription from '#models/user_browser_subscription'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { v4 } from 'uuid'

export default class UserNotificationContextSubscription extends BaseModel {
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_id: string

  @column()
  declare user_browser_subscription_id: string | null // Peut être lié à un appareil spécifique ou non

  @column()
  declare context_name: string // Ex: "order_status_change"

  @column()
  declare context_id: string // Ex: ID de la commande

  @column()
  declare is_active: boolean

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  @beforeCreate()
  public static assignUuid(subscription: UserBrowserSubscription) {
    if (!subscription.id) {
      subscription.id = v4()
    }
  }

  // Relations
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => UserBrowserSubscription)
  declare browserSubscription: BelongsTo<typeof UserBrowserSubscription>
}