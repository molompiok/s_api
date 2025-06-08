import limax from 'limax';
import { DateTime } from 'luxon'
import { beforeCreate, beforeSave, column } from '@adonisjs/lucid/orm'
import Product from './product.js';
import db from '@adonisjs/lucid/services/db';
import { applyOrderBy } from '#controllers/Utils/query';
import BaseModel from './base_model.js';

export default class Categorie extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare parent_category_id: string | null

  @column()
  declare name: string

  @column({
    prepare: (value) => {
      const v = value.replaceAll("\n", "§");
      return v
    },
    consume: (value) => {
      const v = value.replaceAll("§", "\n");
      return v
    }
  })
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
  declare is_visible: boolean

  @column()
  declare slug: string

  // Méthode personnalisée pour récupérer les produits
  public async getProducts() {
    return await Product.query().whereJsonSuperset('categories_id', [this.id])
  }

  // @hasMany(() => Product, {
  //   foreignKey: 'category_id',
  //   localKey: 'id',
  // })
  // declare products: HasMany<typeof Product>;

  @beforeCreate()
  public static async generateSlug(category: Categorie) {
    let baseSlug = limax(category.name, { maintainCase: false })
    category.slug = baseSlug
  }

  @beforeSave()
  public static async saveSlug(category: Categorie) {
    if (category.name) {
      let baseSlug = limax(category.name, { maintainCase: false })
      let slug = baseSlug

      // Vérifier l'unicité du slug
      let count = 0
      while (await Categorie.findBy('slug', slug)) {
        count++
        if (count > 5) throw new Error('Pas de slug touver pour cette category, changer le nom de la category')
        slug = `${baseSlug}-${count}`
      }
      category.slug = slug
    }
  }

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  public static async getGlobalFilters(limit: number = 7) { // J'ai augmenté un peu la limite par défaut, à ajuster si besoin
    // La requête est presque la même que pour getAvailableFilters, sans le filtre sur categoryIds
    const query = `
        WITH
        -- Étape 1: Créer une vue de toutes les paires (produit, feature, valeur) existantes
        ProductFeatureValues AS (
            SELECT
                p.id as product_id,
                LOWER(f.name) as feature_name,
                f.type as feature_type,
                LOWER(v.text) as value_text_lower,
                FIRST_VALUE(v.text) OVER (PARTITION BY LOWER(v.text) ORDER BY v.created_at) as value_text_original,
                v.key,
                v.icon
            FROM products p
            JOIN features f ON f.product_id = p.id
            JOIN "values" v ON v.feature_id = f.id
            WHERE v.text IS NOT NULL
            -- Aucune clause WHERE sur la catégorie ici, car ce sont les filtres globaux
        ),
        -- Étape 2: Pour chaque paire (feature, valeur), compter le nombre de produits distincts
        ValueCounts AS (
            SELECT
                feature_name,
                feature_type,
                value_text_lower,
                value_text_original,
                key,
                icon,
                COUNT(DISTINCT product_id) as product_count
            FROM ProductFeatureValues
            GROUP BY feature_name, feature_type, value_text_lower, value_text_original, key, icon
        ),
        -- Étape 3: Agréger les valeurs dans un tableau JSON pour chaque feature
        AggregatedFilters AS (
            SELECT
                feature_name as name,
                feature_type as type,
                -- On calcule aussi le nombre total de produits pour cette feature pour pouvoir trier dessus
                SUM(product_count) as total_product_count,
                array_agg(
                    jsonb_build_object(
                        'text', value_text_original,
                        'key', key,
                        'icon', icon,
                        'product_count', product_count
                    )
                ) as "values"
            FROM ValueCounts
            GROUP BY feature_name, feature_type
        )
        -- Étape 4: Sélection finale avec tri et limite
        SELECT name, type, "values"
        FROM AggregatedFilters
        ORDER BY total_product_count DESC
        LIMIT ?;
    `;

    // On passe la limite en paramètre de la requête brute pour la sécurité
    const filters = await db.rawQuery(query, [limit]).then(result => result.rows);

    return filters.map((filter: any) => ({
      id: filter.name,
      name: filter.name.charAt(0).toUpperCase() + filter.name.slice(1),
      type: filter.type,
      values: filter.values,
    }));
  }

  public static async getAvailableFilters(slug: string) {
    const categoryIds = await this.get_all_category_ids_by_slug(slug);

    if (!categoryIds || categoryIds.length === 0) {
      return [];
    }

    // Requête SQL brute, car elle devient trop complexe pour le Query Builder seul.
    const query = `
        WITH 
        -- Étape 1: Créer une vue de toutes les paires (produit, feature, valeur) pertinentes pour la catégorie
        ProductFeatureValues AS (
            SELECT
                p.id as product_id,
                LOWER(f.name) as feature_name,
                f.type as feature_type,
                LOWER(v.text) as value_text_lower,
                -- On garde une version originale du texte pour l'affichage (la première trouvée)
                FIRST_VALUE(v.text) OVER (PARTITION BY LOWER(v.text) ORDER BY v.created_at) as value_text_original,
                v.key,
                v.icon
            FROM products p
            JOIN features f ON f.product_id = p.id
            JOIN "values" v ON v.feature_id = f.id
            WHERE p."categories_id"::jsonb \\?| ? AND v.text IS NOT NULL
        ),
        -- Étape 2: Pour chaque paire (feature, valeur), compter le nombre de produits distincts
        ValueCounts AS (
            SELECT
                feature_name,
                feature_type,
                value_text_lower,
                value_text_original,
                key,
                icon,
                COUNT(DISTINCT product_id) as product_count
            FROM ProductFeatureValues
            GROUP BY feature_name, feature_type, value_text_lower, value_text_original, key, icon
        )
        -- Étape 3: Agréger les valeurs (maintenant avec leur compte) dans un tableau JSON pour chaque feature
        SELECT
            feature_name as name,
            feature_type as type,
            array_agg(
                jsonb_build_object(
                    'text', value_text_original,
                    'key', key,
                    'icon', icon,
                    'product_count', product_count
                )
            ) as "values"
        FROM ValueCounts
        GROUP BY feature_name, feature_type
        ORDER BY feature_name;
    `;

    const filters = await db.rawQuery(query, [categoryIds]).then(result => result.rows);

    return filters.map((filter: any) => ({
      id: filter.name,
      name: filter.name.charAt(0).toUpperCase() + filter.name.slice(1),
      type: filter.type,
      values: filter.values,
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
      query = applyOrderBy(query, order_by, Product.table)
    }
    products = await query.paginate(page, limit)
    return {
      category,
      products
    };
  }
}