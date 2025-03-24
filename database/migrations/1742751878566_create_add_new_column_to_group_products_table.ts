import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'group_products'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('decreases_stock') //ATER
      table.boolean('continue_selling')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('decreases_stock')
      table.dropColumn('continue_selling')
    })

  }
}