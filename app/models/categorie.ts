import limax from 'limax';
import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, beforeSave, beforeUpdate, column, hasMany } from '@adonisjs/lucid/orm'
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
  declare parent_category_id: string|null

  @column()
  declare name: string

  @column()
  declare description: string

  @column({
    prepare: (value) => JSON.stringify(value),
  })
  declare view: string[]

  @column({
    prepare: (value) => JSON.stringify(value),
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
    let baseSlug = limax(category.name, { maintainCase: false })
    category.slug = baseSlug
  }

  @beforeUpdate()
  public static async updateSlug(category: Categorie) {
    let baseSlug = limax(category.name, { maintainCase: false })
    category.slug = baseSlug
  }

  @beforeSave()
  public static async saveSlug(category: Categorie) {
    let baseSlug = limax(category.name, { maintainCase: false })
    category.slug = baseSlug
  }
  
  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  public static async getGlobalFilters(limit: number = 5) {
    const filters = await db
      .from('features')
      .join('products', 'products.id', 'features.product_id')
      .select(
        'features.id',
        'features.name',
        'features.type',
        db.raw('array_agg(distinct values.text) as possible_values'),
        db.raw('count(distinct products.id) as product_count') 
      )
      .leftJoin('values', 'values.feature_id', 'features.id')
      .groupBy('features.id', 'features.name', 'features.type')
      .whereNotNull('values.text')
      .orderBy('product_count', 'desc') 
      .limit(limit) 
  
    return filters.map(filter => ({
      id: filter.id,
      name: filter.name,
      type: filter.type,
      values: filter.possible_values,
    }))
  }

  public static async getAvailableFilters(slug: string, limit: number = 5) {
    const categoryIds = await this.get_all_category_ids_by_slug(slug);
  
    if (!categoryIds || categoryIds.length === 0) {
      return []; 
    }
  
    const filters = await db
      .from('features')
      .join('products', 'products.id', 'features.product_id')
      .whereRaw('"categories_id"::jsonb \\?| ?', [categoryIds])
      .select(
        'features.id',
        'features.name',
        'features.type',
        db.raw('array_agg(distinct values.text) as possible_values')
      )
      .join('values', 'values.feature_id', 'features.id') 
      .groupBy('features.id', 'features.name', 'features.type')
      .whereNotNull('values.text')
      .limit(limit);
  
    return filters.map(filter => ({
      id: filter.id,
      name: filter.name,
      type: filter.type,
      values: filter.possible_values,
    }));
  }
  public static async get_all_category_ids_by_slug(slug: string): Promise<string[]> {
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
  
  public static async get_products_with_subcategories_by_slug(slug: string, page = 1, limit = 10, order_by: string) {
    const category = await this.query()
      .where('slug', slug)
      .select('id', 'name', 'description') 
      .first();

    if (!category) {
      throw new Error(`Aucune catégorie trouvée avec le slug "${slug}"`);
    }
    const categoryIds = await this.get_all_category_ids_by_slug(slug);
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