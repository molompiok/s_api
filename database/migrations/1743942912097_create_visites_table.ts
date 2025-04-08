import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'visites'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('ip_address')
      table.string('device_type')
      table.string('browser_name')
      table.string('browser_version')
      table.string('os_name')
      table.string('os_version')
      table.string('referrer').nullable()
      table.string('landing_page')
      table.integer('session_duration').nullable()
      table.boolean('is_authenticate')
      table.timestamp('created_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}