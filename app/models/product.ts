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
      console.log({value});
      
      return JSON.stringify(value);
    },
    consume:(value) => {
      return Array.isArray(value)? value : []
    }
  })
  declare categories_id: string[]

  @column()
  declare default_feature_id:  string

  @column()
  declare name: string


  @column({
    prepare: (value) =>{
      const v = value.replaceAll("\n", "§");
      return v
    },
    consume:(value) => {
      const v = value.replaceAll("§", "\n");      
      return v
    }
  })
  declare description: string

  @column()
  declare price: number

  @column()
  declare barred_price: number | null

  @column()
  declare currency: string

  @column()
  declare comment_count :number 
  
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
}