import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'values'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('feature_id').notNullable().references('id').inTable('features').onDelete('CASCADE')
      table.jsonb('views').defaultTo('[]')
      table.jsonb('icon')
      table.tinyint('index')
      table.string('text')
      table.timestamps(true,true) 
      

    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}