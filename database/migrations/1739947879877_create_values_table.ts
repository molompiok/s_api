import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'values'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('feature_id').notNullable().references('id').inTable('features').onDelete('CASCADE')

      table.string('currency').defaultTo('CFA')
      table.jsonb('views').defaultTo('[]')
      table.json('icon')
      table.string('text')

      table.integer('additional_price').defaultTo(0)
      table.integer('min')
      table.integer('max')
      table.integer('min_size')
      table.integer('max_size')

      table.boolean('multiple').defaultTo(false)
      table.boolean('is_double').defaultTo(false)
      table.timestamps(true,true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}