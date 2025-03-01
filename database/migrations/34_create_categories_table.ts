import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'categories'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().nullable()
      
      table.uuid('store_id').notNullable()
      table.uuid('parent_category_id')
      table.string('name')
      table.json('description')
      table.json('view')
      table.string('icon')

      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}