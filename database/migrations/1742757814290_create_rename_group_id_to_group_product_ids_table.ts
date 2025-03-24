import { BaseSchema } from "@adonisjs/lucid/schema"

export default class RenameGroupIdToGroupProductId extends BaseSchema {
  protected tableName = 'cart_items'

  public async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.renameColumn('group_id', 'group_product_id')
    })
  }

  public async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.renameColumn('group_product_id', 'group_id')
    })
  }
}
