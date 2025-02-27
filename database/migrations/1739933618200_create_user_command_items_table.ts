import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_command_items'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('command_id').nullable().references('id').inTable('user_commands')
      table.uuid('product_id').references('id').inTable('products')
      table.uuid('user_id').references('id').inTable('users')
      table.uuid('store_id')
      table.string('status')
      table.json('views')
      table.integer('quantity')
      table.integer('price_unit')
      table.string('currency')
      table.json('features')

      table.timestamps(true,true) 
    })
  }
  async down() {
    this.schema.dropTable(this.tableName)
  }
}