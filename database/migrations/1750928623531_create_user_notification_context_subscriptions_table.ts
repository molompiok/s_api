import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateUserNotificationContextSubscriptionsTable extends BaseSchema {
  protected tableName = 'user_notification_context_subscriptions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable()
      
      // Optionnel: Lier à un appareil spécifique. Si omis, le contexte s'applique à tous les appareils actifs de l'utilisateur.
      // Pour plus de granularité, on peut l'ajouter.
      table.uuid('user_browser_subscription_id').references('id').inTable('user_browser_subscriptions').onDelete('CASCADE').nullable()

      table.string('context_name', 100).notNullable() // Ex: 'order_update', 'new_product_in_category'
      table.string('context_id', 255).notNullable()   // Ex: ID de la commande, ID de la catégorie

      table.boolean('is_active').defaultTo(true).notNullable() // L'utilisateur peut désactiver ce contexte

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      // Index unique pour éviter les doublons d'abonnement au même contexte (par appareil ou globalement)
      // table.unique(['user_id', 'context_name', 'context_id', 'user_browser_subscription_id'])
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.index(['user_id', 'context_name', 'context_id'])
      table.index(['user_browser_subscription_id']) // Si la colonne est utilisée
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}