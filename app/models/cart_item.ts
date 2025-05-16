import { DateTime } from 'luxon'
import { belongsTo, column } from '@adonisjs/lucid/orm'
import Cart from './cart.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations';
import BaseModel from './base_model.js';
import Product from './product.js';
import Feature, { FeatureType } from './feature.js';
import Value from './value.js';
import { ValueInterface } from '#controllers/features_controller';
export default class CartItem extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare cart_id: string

  @column({
    prepare(value) {
      return typeof value !== 'string' ? JSON.stringify(value || '{}') : value //TOS verification plus rigoureurse
    },
  })
  declare bind: string //NEW

  @column()
  declare product_id: string //NEW

  @column()
  declare quantity: number

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  @belongsTo(() => Cart, {
    foreignKey: 'cart_id',
    localKey: 'id',
  })
  declare cart: BelongsTo<typeof Cart>

  @belongsTo(() => Product, {
    foreignKey: 'product_id',
    localKey: 'id',
  })
  declare product: BelongsTo<typeof Product>


  public getBind() {
    try {
      return JSON.parse(this.bind);
    } catch (error) {
      return {}
    }
  }

  public static async getBindOptionFrom(bind: string | object, product: Product | { id: string }) {
    if (!bind) return
    if (typeof bind == 'string') {
      try {
        bind = JSON.parse(bind);
      } catch (error) {
        return;
      }
    }

    if (typeof bind !== 'object') return
    let additionalPrice = 0;
    let stock: number | null = Infinity; // On prend le minimum donc on part d'un grand nombre
    let decreasesStock = false;
    let continueSelling = false;
    let bindName: Record<string, ValueInterface> = {};
    let bindId: Record<string, ValueInterface> = {};
    let realBind: Record<string, string> = {};
    for (const [feature_id, value_id] of Object.entries(bind)) {

      const feature = await Feature.findOrFail(feature_id);
      if ([
        FeatureType.TEXT,
        FeatureType.COLOR,
        FeatureType.ICON,
        FeatureType.ICON_TEXT
      ].includes(feature.type)) {
        if (!value_id) continue;
        const value = await Value.findOrFail(value_id);

        bindName[`${feature.name}:${feature.type}`] = value.toJSON();
        bindId[feature.id] = value.toJSON();
        realBind[feature.id] = value.id
        // Mettre à jour le prix supplémentaire
        if (value.additional_price) {
          additionalPrice += value.additional_price;
        }

        // Mettre à jour le stock (on prend le minimum)
        if (value.stock !== null) {
          value.stock && (stock = Math.min(stock, value.stock));
        }

        // Mettre à jour les booléens s'ils sont définis
        if (value.decreases_stock !== null) {
          decreasesStock = decreasesStock || !!value.decreases_stock;
        }
        if (value.continue_selling !== null) {
          continueSelling = continueSelling || !!value.continue_selling;
        }
      } else {
        const inputValue = value_id
        realBind[feature.id] = inputValue
        bindName[`${feature.name}:${feature.type}`] = inputValue;
        bindId[feature.id] = inputValue;
      }
    }

    return {
      bind,
      realBind,
      bindId,
      bindName,
      additional_price: additionalPrice,
      stock: stock,
      product_id: product.id,
      decreases_stock: decreasesStock,
      continue_selling: continueSelling
    }
  }
  public static compareBind(bind_a: any, bind_b: any) {
    
    if (typeof bind_a !== 'object') return false
    if (typeof bind_b !== 'object') return false

    for (const [a_feature, a_value] of bind_a) {
      if (a_value && (bind_b[a_feature] !== a_value)) {
        return false;
      }
    }

    for (const [b_feature, b_value] of bind_b) {
      if (b_value && (bind_a[b_feature] !== b_value)) {
        return false;
      }
    }
    return true
  }
  public compareBindTo(externalBind: any) {
    return CartItem.compareBind(
      this.getBind(),
      externalBind
    )
  }
}

