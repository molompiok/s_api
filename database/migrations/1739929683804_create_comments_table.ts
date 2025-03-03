import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'comments'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable().primary()
      table.uuid('user_id').notNullable().references('id').inTable('users')
      table.uuid('product_id').notNullable().references('id').inTable('products')
      table.text('title').notNullable()
      table.text('description').nullable()
      table.jsonb('views').defaultTo('[]')
      table.integer('rating').notNullable()

      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}