import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'products'

  async up() {
    // Utiliser une requête SQL brute pour modifier la longueur des colonnes
    // sans recréer les contraintes (notamment la contrainte unique)
    await this.db.rawQuery(`
      ALTER TABLE ${this.tableName} 
      ALTER COLUMN name TYPE VARCHAR(500),
      ALTER COLUMN description TYPE VARCHAR(2000)
    `)
  }

  async down() {
    // Rollback : revenir aux longueurs originales
    await this.db.rawQuery(`
      ALTER TABLE ${this.tableName} 
      ALTER COLUMN name TYPE VARCHAR(52),
      ALTER COLUMN description TYPE VARCHAR(1024)
    `)
  }
}