import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'products'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('store_id').notNullable()
      table.uuid('category_id').references('id').inTable('categories')
      table.string('name').notNullable().unique()
      table.uuid('default_feature_id').notNullable().unique()
      table.string("slug").notNullable().unique();
      table.text('description')
      table.integer('barred_price')
      table.integer('price')
      table.string('currency').defaultTo('CFA')

      table.index('slug');
      table.timestamps(true)  
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}