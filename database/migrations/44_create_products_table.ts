import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'products'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('store_id')
      table.uuid('category_id').references('id').inTable('categories')
      table.string('name')
      table.string('default_feature_id').notNullable().unique()
    
      table.text('description')
      table.integer('barred_price')
      table.integer('price')
      table.string('currency').defaultTo('CFA')
      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}