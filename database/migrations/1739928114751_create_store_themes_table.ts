import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'store_themes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('theme_id').notNullable().references('id').inTable('themes')
      table.string('name',52).notNullable()
      table.string('description',1024).notNullable()
      table.jsonb('view').defaultTo('[]')
      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}