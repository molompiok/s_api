import { CURRENCY } from '#models/user_order'
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'products'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.jsonb('categories_id')
      table.string('name',52).notNullable().unique()
      table.uuid('default_feature_id').notNullable()
      table.string("slug").notNullable().unique();
      table.string('description',1024).nullable()
      table.integer('barred_price').nullable().checkPositive()
      table.integer('price').defaultTo(0).checkPositive()
      table.string('currency').defaultTo(CURRENCY.FCFA)
      table.double('rating').nullable().defaultTo(0)
      table.integer('comment_count').defaultTo(0).notNullable()

      table.index('slug');
      table.boolean('is_visible');
      table.timestamps(true)  
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}