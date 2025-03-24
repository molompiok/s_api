import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'values'

  
  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('additional_price')
      table.string('currency') 
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('additional_price')
      table.dropColumn('currency')
    })

  }
}

