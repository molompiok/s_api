import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_command_items'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('user_command_id').references('id').inTable('user_commands')
      table.uuid('product_id').references('id').inTable('products')
      table.integer('quantity')
      table.integer('price_unit')
      table.string('devise')
      table.json('features')

      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}