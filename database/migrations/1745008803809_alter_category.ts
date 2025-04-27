import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AddUserIdToRoles extends BaseSchema {
  protected tableName = 'categories'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('is_visible')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('is_visible')
    })
  }
}