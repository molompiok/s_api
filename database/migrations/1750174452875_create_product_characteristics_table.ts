// database/migrations/XXXXXX_create_product_characteristics_table.ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'product_characteristics'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.uuid('product_id').references('id').inTable('products').notNullable()

      table.string('name', 255).notNullable() // Ex: "Poids", "Couleur principale", "Matériau"
      table.jsonb('icon').nullable()    // URL ou nom d'icône (ex: 'lucide:weight')
      table.text('description').nullable()
      table.string('key', 100).nullable() // Clé optionnelle pour usage programmatique (ex: "weight_kg", "main_color_hex") - peut être unique par produit ou globalement
  
      table.string('value_text', 512).nullable() // Pour stocker "10 kg", "Rouge", "Coton", etc.

      table.decimal('quantity', 12, 4).nullable() // Valeur numérique
      table.string('unity', 52).nullable()        // Unité (kg, cm, pcs, etc.)
      
      table.integer('level').unsigned().nullable() // Niveau d'importance ou catégorie de la caractéristique
      table.integer('index').unsigned().defaultTo(0) // Pour l'ordre d'affichage

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.index(['product_id'])
      table.index(['product_id', 'key'])
      table.index(['product_id', 'index'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}