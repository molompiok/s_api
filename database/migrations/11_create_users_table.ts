import { RoleType } from '#models/user'
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('role_id').nullable().references('id').inTable('roles')
      table.string('full_name').notNullable()
      table.enum('type', Object.values(RoleType)).defaultTo(RoleType.CLIENT)
      table.string('email', 254).notNullable().unique()
      table.string('password').notNullable()
      table.jsonb('photo').defaultTo('[]')

      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}