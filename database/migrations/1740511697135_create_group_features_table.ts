import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'group_features'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable().primary()
      table.uuid('product_id').notNullable().references('id').inTable('products')
      table.integer('stock')
      table.integer('additional_price').defaultTo(0)
      table.jsonb('bind').nullable() // exemple {couleur : red , taille : XL}
      table.timestamp('created_at')
      table.timestamp('updated_at')

      this.schema.alterTable('group_features', (table) => {
        table.index(['bind'], 'group_features_bind_idx', 'gin')
      })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}