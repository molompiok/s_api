import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateUserBrowserSubscriptionsTable extends BaseSchema {
  protected tableName = 'user_browser_subscriptions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable()
      
      table.text('endpoint').notNullable().unique() // L'URL du service push, doit être unique
      table.string('p256dh_key', 512).notNullable() // Clé p256dh
      table.string('auth_key', 255).notNullable()   // Clé d'authentification

      table.text('user_agent_raw').nullable()
      table.string('browser_name', 100).nullable()
      table.string('browser_version', 50).nullable()
      table.string('os_name', 100).nullable()
      table.string('os_version', 50).nullable()
      table.string('device_type', 50).nullable() // ex: 'desktop', 'mobile', 'tablet'

      table.boolean('is_active').defaultTo(true).notNullable()
      table.timestamp('last_used_at', { useTz: true }).nullable() // Pourrait être mis à jour lors de l'envoi réussi d'une notif

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.index(['user_id'])
      table.index(['user_id', 'is_active'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}