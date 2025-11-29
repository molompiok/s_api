import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'products'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('name', 500).notNullable().unique().alter()
      table.string('description', 2000).nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('name', 52).notNullable().unique().alter()
      table.string('description', 1024).nullable().alter()
    })
  }
}