import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AddUserIdToRoles extends BaseSchema {
  protected tableName = 'roles'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('loacle')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('loacle')
    })
  }
}