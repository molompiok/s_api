import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'features'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('product_id').notNullable().references('id').inTable('products')
      table.string('name').nullable()
      table.string('type')
      table.jsonb('icon').defaultTo('[]')
      table.boolean('required')
      table.string('default')

      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}