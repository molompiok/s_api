import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'features'

  async up() {
    this.schema.createTable(this.tableName, (table) => {

      table.uuid('id').primary().notNullable()
      table.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE')
      table.string('name').notNullable()
      table.string('type').checkIn(['color','text', 'icon_text','icon','input','date','range','file'])
      table.jsonb('icon').defaultTo('[]')
      table.boolean('required').defaultTo(false)

      table.string('regex').nullable()
      table.integer('min').nullable()
      table.integer('max').nullable()
      table.integer('min_size').nullable()
      table.integer('max_size').nullable()
      table.tinyint('index').checkPositive()
      table.boolean('multiple').defaultTo(false)
      table.boolean('is_double').defaultTo(false)

      table.string('default').nullable()
      
      table.timestamps(true)

    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}