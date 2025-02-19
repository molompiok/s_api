import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'stores'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('user_id').notNullable().references('id').inTable('users')

      table.string('name')
      table.json('logo')
      table.json('banner')
      table.text('description')
      table.string('url')
      table.string('current_theme_id')
      table.integer('api_port')
      table.integer('expire_at')
      table.integer('disk_storage_limit_gb')
      
      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}