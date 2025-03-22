import { OrderStatus } from '#models/user_command'
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_command_items'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('command_id').nullable().references('id').inTable('user_commands').onDelete('CASCADE')
      table.uuid('group_product_id').references('id').inTable('group_products').onDelete('CASCADE')
      table.uuid('store_id').notNullable()
       table.enu('status', Object.values(OrderStatus)).nullable()
      table.integer('quantity').notNullable().defaultTo(1)
      table.integer('price_unit')
      table.string('currency').defaultTo('CFA')
      table.json('features')

      table.timestamps(true,true) 
    })
  }
  async down() {
    this.schema.dropTable(this.tableName)
  }
}