import { CURRENCY, OrderStatus } from '#models/user_order'
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_order_items'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('user_id').notNullable()
      table.uuid('order_id').notNullable()
      table.uuid('product_id').notNullable()
      table.jsonb('bind') 
      table.jsonb('bind_name') 
       table.enu('status', Object.values(OrderStatus)).nullable()
      table.integer('quantity').notNullable().defaultTo(1)
      table.integer('price_unit')
      table.string('currency').defaultTo(CURRENCY.FCFA)
      table.json('features')

      table.timestamps(true,true) 
    })
  }
  async down() {
    this.schema.dropTable(this.tableName)
  }
}