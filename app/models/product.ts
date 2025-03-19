import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column, hasMany, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
import limax from "limax";
import type { HasMany } from '@adonisjs/lucid/types/relations';
import Feature from './feature.js';

export default class Product extends BaseModel {
  
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare store_id: string

  @column()
  declare category_id: string

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
    let baseSlug = limax(product.name, { maintainCase: true })
    product.slug = baseSlug
  }

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}