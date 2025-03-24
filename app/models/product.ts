import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, beforeSave, beforeUpdate, column, hasMany, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
import limax from "limax";
import type { HasMany } from '@adonisjs/lucid/types/relations';
import Feature from './feature.js';

export default class Product extends BaseModel {
  
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare store_id: string

  @column({
    prepare: (value) => JSON.stringify(value),
  })
  declare categories_id: string[]

  @column()
  declare default_feature_id:  string

  @column()
  declare name: string

  @column()
  declare description: string

  @column()
  declare price: number

  @column()
  declare barred_price: number

  @column()
  declare currency: string

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
}