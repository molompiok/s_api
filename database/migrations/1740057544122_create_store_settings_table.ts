import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'store_settings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable().primary()

      table.uuid('store_id')
      table.uuid('user_id')
      table.string('currency').defaultTo('CFA')
      

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}