import { BaseSchema } from '@adonisjs/lucid/schema'

export default class RenameCommandToOrder extends BaseSchema {
  async up() {
    this.schema.renameTable('user_commands', 'user_orders')
    this.schema.renameTable('user_command_items', 'user_order_items')

    this.schema.alterTable('user_order_items', (table) => {
      table.renameColumn('command_id', 'order_id')
    })
  }

  async down() {
    this.schema.renameTable('user_orders', 'user_commands')
    this.schema.renameTable('user_order_items', 'user_command_items')

    this.schema.alterTable('user_order_items', (table) => {
      table.renameColumn('order_id', 'command_id')
    })
  }
}
