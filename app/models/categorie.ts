import limax from 'limax';
import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column, hasMany } from '@adonisjs/lucid/orm'
import Product from './product.js';
import type { HasMany } from '@adonisjs/lucid/types/relations';
import db from '@adonisjs/lucid/services/db';
import { applyOrderBy } from '#controllers/Utils/query';

export default class Categorie extends BaseModel {
  @column({ isPrimary: true })
  declare id: string | null

  @column()
  declare store_id: string

  @column()
  declare parent_category_id: string

  @column()
  declare name: string

  @column()
  declare description: string

  @column({
    prepare: (value) => JSON.stringify(value),
    // consume: (value) => JSON.parse(value),
  })
  declare view: string[]

  @column({
    prepare: (value) => JSON.stringify(value),
    // consume: (value) => JSON.parse(value),
  })
  declare icon: string[]

  @column()
  declare slug: string

  @hasMany(() => Product, {
    foreignKey: 'category_id',
    localKey: 'id',
  })
  declare products: HasMany<typeof Product>;

  @beforeCreate()
  public static async generateSlug(category: Categorie) {
    let baseSlug = limax(category.name, { maintainCase: true });
    const existing = await this.findBy('slug', baseSlug);
    category.slug = existing ? `${baseSlug}-${category.slug || Date.now()}` : baseSlug;
  }

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime


  public static async getAllCategoryIdsBySlug(slug: string): Promise<string[]> {
    const result = await db.rawQuery(`
      WITH RECURSIVE category_tree AS (
        -- Point de départ : la catégorie avec le slug donné
        SELECT id
        FROM categories
        WHERE slug = ?
        UNION ALL
        -- Partie récursive : ajouter les sous-catégories
        SELECT c.id
        FROM categories c
        INNER JOIN category_tree ct ON c.parent_category_id = ct.id
      )
      SELECT id FROM category_tree;
    `, [slug]);

    if (result.rows.length === 0) {
      throw new Error(`Aucune catégorie trouvée avec le slug "${slug}"`);
    }

    return result.rows.map((row: any) => row.id);
  }

  public static async getProductsWithSubCategoriesBySlug(slug: string, page = 1, limit = 10, order_by: string) {
    const category = await this.query()
      .where('slug', slug)
      .select('id', 'name', 'description') // Sélectionner uniquement ce dont on a besoin
      .first();

    if (!category) {
      throw new Error(`Aucune catégorie trouvée avec le slug "${slug}"`);
    }
    const categoryIds = await this.getAllCategoryIdsBySlug(slug);
    let products = null
    let query = Product.query()
      .whereIn('category_id', categoryIds)

    if (order_by) {
      query =  applyOrderBy(query, order_by, Product.table)
    } 
     products = await query.paginate(page, limit)
    return {
      category,
      products
    };
  }
}