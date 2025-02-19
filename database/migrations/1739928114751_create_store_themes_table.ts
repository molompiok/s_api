import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'store_themes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('theme_id').notNullable().references('id').inTable('themes')
      table.uuid('store_id').notNullable().references('id').inTable('stores')
      table.string('name')
      table.string('description')
      table.json('view')
      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}