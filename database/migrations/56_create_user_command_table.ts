import { OrderStatus, PaymentMethod, PaymentStatus } from '#models/user_order'
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_commands'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('store_id').notNullable()
      table.uuid('user_id').notNullable().references('id').inTable('users')
      table.string('reference').notNullable()
      table.enu('status', Object.values(OrderStatus)).notNullable()
      table.enu('payment_status', Object.values(PaymentStatus)).notNullable()
      table.enu('payment_method', Object.values(PaymentMethod)).notNullable()
      table.string('currency').defaultTo('CFA')
      table.integer('total_price').nullable()
      table.integer('delivery_price').nullable() 
      table.integer('return_delivery_price').nullable() 
      table.boolean('with_delivery').notNullable().defaultTo(false)

      table.string('phone_number').nullable() 
      table.string('formatted_phone_number').nullable() 
      table.string('country_code').nullable() 

      table.string('pickup_address').nullable()
      table.timestamp('pickup_date').nullable()

      table.timestamp('delivery_date').nullable()
      table.string('delivery_address').nullable()
      table.double('delivery_longitude').nullable()  
      table.double('delivery_latitude').nullable()  
      table.double('pickup_latitude').nullable()
      table.double('pickup_longitude').nullable()
      table.string('pickup_address_name').nullable()
      table.string('delivery_address_name').nullable()



      table.timestamps(true,true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}