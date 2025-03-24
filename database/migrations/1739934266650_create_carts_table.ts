import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'carts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('user_id').notNullable().references('id').inTable('users')
      table.timestamps(true,true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}