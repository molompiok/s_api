import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cart_items'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('cart_id').notNullable().references('id').inTable('carts').onDelete('CASCADE')
      table.uuid('group_id').notNullable().references('id').inTable('group_products').onDelete('CASCADE')
      table.integer('quantity').notNullable().defaultTo(1)
      table.timestamps(true, true)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}