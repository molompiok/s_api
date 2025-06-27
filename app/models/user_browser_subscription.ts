import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, beforeCreate } from '@adonisjs/lucid/orm'
import User from '#models/user' // Ton modèle User dans s_api
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { v4 } from 'uuid'

export default class UserBrowserSubscription extends BaseModel {
  static selfAssignPrimaryKey = true // Si tu utilises defaultTo pour l'ID dans la migration

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_id: string

  @column()
  declare endpoint: string

  @column({ columnName: 'p256dh_key' }) // Mappe vers le nom de colonne de la DB
  declare p256dhKey: string

  @column({ columnName: 'auth_key' }) // Mappe vers le nom de colonne de la DB
  declare authKey: string

  @column()
  declare user_agent_raw: string | null

  @column()
  declare browser_name: string | null

  @column()
  declare browser_version: string | null

  @column()
  declare os_name: string | null

  @column()
  declare os_version: string | null

  @column()
  declare device_type: string | null

  @column()
  declare is_active: boolean

  @column.dateTime()
  declare last_used_at: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  // Relation
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  // Hook pour l'ID (si tu ne comptes pas sur defaultTo de la DB pour la génération avant l'insert)
  @beforeCreate()
  public static assignUuid(subscription: UserBrowserSubscription) {
    if (!subscription.id) {
      subscription.id = v4()
    }
  }

  // Méthode pour convertir en objet PushSubscriptionJSON pour la librairie web-push
  public toPushSubscriptionJSON(): { endpoint: string; keys: { p256dh: string; auth: string } } {
    return {
      endpoint: this.endpoint,
      keys: {
        p256dh: this.p256dhKey,
        auth: this.authKey,
      },
    };
  }
}