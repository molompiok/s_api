import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'comments'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable().primary()
      
      table.uuid('user_id').notNullable().references('id').inTable('users')
      table.uuid('order_item_id').notNullable().references('id').inTable('user_order_items')
      table.uuid('product_id').notNullable().references('id').inTable('products')
      table.uuid('order_id').notNullable().references('id').inTable('user_orders')
      
      table.string('title',255).notNullable()
      table.string('description',1024).nullable()
      table.jsonb('views').defaultTo('[]')
      table.float('rating').notNullable().defaultTo(0);
      table.jsonb('bind_name')
      
      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}