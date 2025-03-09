import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'features'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE')
      table.string('name').nullable()
      table.tinyint('type')
      table.jsonb('icon').defaultTo('[]')
      table.boolean('required').defaultTo(false)
      table.string('default')

      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}