import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'values'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('feature_id').notNullable().references('id').inTable('features')
      table.uuid('product_id').notNullable().references('id').inTable('products')

      table.string('devise')
      table.string('type')
      table.json('icon')
      table.string('text')


      table.integer('additional_price')
      table.integer('min')
      table.integer('max')
      table.integer('min_size')
      table.integer('max_size')


      table.boolean('is_double')
      table.boolean('multiple')
      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}