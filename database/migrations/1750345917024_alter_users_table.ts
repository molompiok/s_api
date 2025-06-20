import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AddStatusToUsers extends BaseSchema {
  protected tableName = 'users'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('status').defaultTo('client').notNullable()
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('status')
    })
  }
}
