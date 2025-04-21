import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'roles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table
        .uuid('user_id')
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
        .notNullable()
        
      table.boolean('filter_client').defaultTo(false)
      table.boolean('ban_client').defaultTo(false)
      table.boolean('filter_collaborator').defaultTo(false)
      table.boolean('ban_collaborator').defaultTo(false)
      table.boolean('create_delete_collaborator').defaultTo(false)
      table.boolean('manage_interface').defaultTo(false)
      table.boolean('filter_product').defaultTo(false)
      table.boolean('edit_product').defaultTo(false)
      table.boolean('create_delete_product').defaultTo(false)
      table.boolean('manage_scene_product')
      table.boolean('chat_client').defaultTo(false)
      table.boolean('filter_command').defaultTo(false)
      table.boolean('manage_command').defaultTo(false)

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}