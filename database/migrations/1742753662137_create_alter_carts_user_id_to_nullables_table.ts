import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'carts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('user_id').nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('user_id').notNullable().alter()
    })
  }
}
