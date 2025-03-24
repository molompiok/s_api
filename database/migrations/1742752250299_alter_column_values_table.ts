import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'values'

  
  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('stock')
      table.string('key') 
      table.boolean('decreases_stock')
      table.boolean('continue_selling')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('stock')
      table.dropColumn('key')
      table.dropColumn('continue_selling')
      table.dropColumn('continue_selling')
    })

  }
}
