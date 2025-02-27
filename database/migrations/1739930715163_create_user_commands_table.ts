import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_commands'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('store_id').notNullable()
      table.uuid('user_id').notNullable().references('id').inTable('users')
      table.string('reference').nullable()
      table.string('delivery_status').nullable()
      table.string('payment_status').nullable()
      table.string('payment_method').nullable()
      table.string('currency').defaultTo('CFA')      
      table.integer('total_price').nullable()
      table.integer('price_delivery').nullable()
      table.integer('price_return_delivery').nullable()
      table.boolean('with_delivery').notNullable().defaultTo(false)

      table.string('phone_number_customer').nullable()
      table.string('format_number_customer').nullable()
      table.string('country_code_customer').nullable()

      table.string('pickup_address').nullable()
      table.string('pickup_date').nullable()
      
      table.string('delivery_date').nullable()
      table.string('delivery_address').nullable()
      table.double('longitude_delivery').nullable()
      table.double('latitude_delivery').nullable()
      table.double('latitude_pickup').nullable()
      table.double('longitude_pickup').nullable()
      table.string('pickup_address_name').nullable()
      table.string('delivery_address_name').nullable()


      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}