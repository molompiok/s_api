import { RoleType } from '#models/user'
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().notNullable()
      
      table.string('full_name').notNullable()
      table.enum('type', Object.values(RoleType)).defaultTo(RoleType.CLIENT)
      table.string('email', 254).notNullable().unique()
      table.string('password').notNullable()
      table.string('loacle')
      table.jsonb('photo').defaultTo('[]')
      table.timestamp('email_verified_at', { useTz: true }).nullable().defaultTo(null)
      table.index(['email_verified_at'], 'users_email_verified_at_index')//pour rechercher rapidement les utilisateurs non vérifiés
      table.string('status').defaultTo('client').notNullable()
      
      table.timestamps(true) 
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}