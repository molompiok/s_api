// database/migrations/XXXXXX_create_product_faqs_table.ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'product_faqs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.uuid('product_id').references('id').inTable('products').onDelete('CASCADE').notNullable()

      table.string('title', 255).notNullable()
      table.text('content').notNullable()
      table.jsonb('sources').nullable() // Tableau d'URLs [{ label: 'Doc PDF', url: 'http://...' }, ...]
      table.string('group', 100).nullable()
      table.integer('index').unsigned().defaultTo(0) 

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
    })

    // Index pour améliorer les performances des requêtes par product_id et group/index
    this.schema.alterTable(this.tableName, (table) => {
      table.index(['product_id'])
      table.index(['product_id', 'group'])
      table.index(['product_id', 'index'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}