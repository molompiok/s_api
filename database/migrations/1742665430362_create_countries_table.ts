import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'countries'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.string('name').notNullable()
      table.string('format_number').notNullable()
      table.integer('length_number').notNullable()
      table.string('lang').notNullable()
      table.string('code').notNullable()
      table.string('currency').notNullable()
      table.string('flag').notNullable()
      table.string('bound').nullable()

      table.timestamps(true, true)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
