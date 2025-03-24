import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'group_products'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable().primary()
      table.uuid('product_id').notNullable().references('id').inTable('products')
      table.integer('stock')
      table.string('currency').defaultTo('CFA')
      table.integer('additional_price').defaultTo(0)
      table.jsonb('bind').nullable() // exemple {couleur : red , taille : XL}
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })


    this.schema.alterTable('group_products', (table) => {
      table.index(['bind'], 'group_products_bind_idx', 'gin')
    })
    
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}