import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'categories'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().nullable()
      
      table.uuid('parent_category_id')
      table.string('name',52).notNullable()
      table.string('slug').notNullable().unique()
      table.string('description',1024).nullable()
      table.jsonb('view').defaultTo('[]')
      table.jsonb('icon').defaultTo('[]')
      
      table.index('slug');
      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}