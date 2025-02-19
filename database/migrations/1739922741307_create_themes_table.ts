import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'themes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.string('name')
      table.string('port')
      table.string('dir')
      table.string('primary_port')
      table.string('cmd_start')
      table.string('cmd_stop')
      table.string('cmd_restart')

      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}