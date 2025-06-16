import { DateTime } from 'luxon'
import { beforeCreate, beforeSave, beforeUpdate, column, hasMany } from '@adonisjs/lucid/orm'
import limax from "limax";
import type { HasMany } from '@adonisjs/lucid/types/relations';
import Feature from './feature.js';
import BaseModel from './base_model.js';
export default class Product extends BaseModel {

  @column({ isPrimary: true })
  declare id: string

  @column({
    prepare: (value) => {
      console.log({ value });

      return JSON.stringify(value);
    },
    consume: (value) => {
      return Array.isArray(value) ? value : []
    }
  })
  declare categories_id: string[]

  @column()
  declare default_feature_id: string

  @column()
  declare name: string

  @column()
  declare is_visible: boolean


  @column({
    prepare: (value) => {
      const v = value?.replaceAll("\n", "§")||'';
      return v
    },
    consume: (value) => {
      const v = value?.replaceAll("§", "\n")||'';
      return v
    }
  })
  declare description: string | null

  @column()
  declare price: number

  @column()
  declare barred_price: number | null

  @column()
  declare currency: string

  @column()
  declare comment_count: number

  @column()
  declare rating: number

  @column()
  declare slug: string

  @hasMany(() => Feature, {
    foreignKey: 'product_id', // La clé étrangère dans la table features
    localKey: 'id',          // La clé primaire dans la table products
  })

  declare features: HasMany<typeof Feature>

  @beforeCreate()
  public static async generateSlug(product: Product) {
    let baseSlug = limax(product.name, { maintainCase: false })
    product.slug = baseSlug
  }

  @beforeUpdate()
  public static async updateSlug(product: Product) {
    let baseSlug = limax(product.name, { maintainCase: false })
    product.slug = baseSlug
  }

  @beforeSave()
  public static async saveSlug(product: Product) {
    let baseSlug = limax(product.name, { maintainCase: false })
    product.slug = baseSlug
  }

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime


  /**
   * Récupère des produits similaires basés sur les catégories partagées (cross-selling).
   * 
   * @param currentProductSlug - Le slug du produit actuellement consulté.
   * @param limit - Le nombre maximum de produits à retourner.
   * @returns Une promesse résolue avec un tableau de produits similaires.
   */
  public static async getSimilarProductsByCategory(currentProductSlug: string, limit: number = 8): Promise<Product[]> {
    // 1. Récupérer le produit actuel pour obtenir sa liste de catégories.
    //    On ne sélectionne que les colonnes nécessaires pour optimiser la requête.
    const currentProduct = await Product.query()
      .where('slug', currentProductSlug)
      .select('id', 'categories_id')
      .firstOrFail(); // `firstOrFail` lève une erreur si le produit n'est pas trouvé.

    // 2. Vérifier si le produit a des catégories associées.
    if (!currentProduct.categories_id || currentProduct.categories_id.length === 0) {
      // Si le produit n'a pas de catégorie, on ne peut pas trouver de produits similaires.
      // On retourne un tableau vide.
      return [];
    }

    // 3. Rechercher d'autres produits qui partagent au moins une catégorie.
    const similarProducts = await Product.query()
      .where('is_visible', true) // Uniquement les produits visibles par les clients.
      .whereNot('id', currentProduct.id) // Exclure le produit actuel de la liste des résultats.
      // La magie du JSONB de PostgreSQL : l'opérateur `?|` vérifie si les tableaux JSONB ont des éléments en commun.
      // C'est extrêmement efficace pour ce cas d'usage.
      .whereRaw(`"categories_id"::jsonb \\?| ?`, [currentProduct.categories_id])
      // On peut ajouter un tri pour rendre les résultats plus pertinents.
      // Par exemple, trier par date de création pour montrer les nouveautés en premier.
      .orderBy('created_at', 'desc')
      .limit(limit)
      // Pré-charger les données nécessaires pour l'affichage des cartes produits (features et leurs valeurs).
      .preload('features', (featureQuery) => {
        featureQuery.orderBy('created_at', 'asc').preload('values', (valueQuery) => {
          valueQuery.orderBy('created_at', 'asc');
        });
      });

    return similarProducts;
  }
}