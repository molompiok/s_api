import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'details'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id')

      table.uuid('product_id').references('id').inTable('products').notNullable()
      table.string('title')
      table.text('description') 
      table.jsonb('view').nullable() 
      table.smallint('index').defaultTo(0)
      table.string('type')

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}