import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AddUserIdToRoles extends BaseSchema {
  protected tableName = 'inventories'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('views')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('views')
    })
  }
} 