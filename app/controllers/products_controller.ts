import Product from '#models/product';
import type { HttpContext } from '@adonisjs/core/http'
import { v4 } from 'uuid';
import { applyOrderBy } from './Utils/query.js';
import { EXT_IMAGE, EXT_VIDEO, MEGA_OCTET } from './Utils/ctrlManager.js';
import Feature, { FeatureType } from '#models/feature';
import Value from '#models/value';
import { createFiles } from './Utils/media/CreateFiles.js';
import Categorie from '#models/categorie';
import { ModelPaginatorContract, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model';
import db from '@adonisjs/lucid/services/db';
import { CURRENCY } from '#models/user_order';
import FeaturesController from './features_controller.js';
import { MAX_PRICE } from './Utils/constants.js';


export default class ProductsController {
  async create_product({ request, response }: HttpContext) {
    const trx = await db.transaction()
    try {
      let { name, description, price, categories_id, barred_price } = request.body()

      const feature_id = v4()
      const product_id = v4()
      const value_id = v4()

      // Gestion des fichiers
      const views = await createFiles({
        request,
        column_name: 'views',
        table_id: value_id,
        table_name: Value.table,
        options: { throwError: true, min: 1, max: 5, extname: [...EXT_IMAGE, ...EXT_VIDEO], maxSize: 12 * MEGA_OCTET },
      })
      const icon = await createFiles({
        request,
        column_name: 'icon',
        table_id: value_id,
        table_name: Value.table,
        options: { throwError: true, min: 0, max: 1, extname: EXT_IMAGE, maxSize: 2 * MEGA_OCTET },
      })

      if (!views.length) {
        throw new Error('Product view required')
      }

      // Création en base de données
      price = price && parseFloat(price);
      barred_price = barred_price && parseFloat(barred_price);
      if (Number.isNaN(price)) throw new Error('Le prix doit est un numbre');
      if (Number.isNaN(barred_price)) barred_price = undefined;
      if (price > MAX_PRICE) throw new Error('Le prix doit inferieur a ' + MAX_PRICE);
      if (barred_price > MAX_PRICE) throw new Error('Le prix barré doit inferieur a ' + MAX_PRICE);
      if (barred_price && (barred_price <= 0)) throw new Error('Le prix barré doit etre superieur a 0');
      if (price <= 0) throw new Error('Le prix du produit doit etre superieur a 0');


      const product = await Product.create({
        id: product_id,
        name: name.replace(/\s+/g, ' '),
        description: description?.trim().substring(0, 1024) || null,
        price: price,
        categories_id: categories_id,
        barred_price: barred_price,
        default_feature_id: feature_id,
        currency: CURRENCY.FCFA,
      }, { client: trx })

      const feature = await Feature.create({
        id: feature_id,
        product_id,

        name: 'Les images de chaque variante du produit',
        required: false,
        type: FeatureType.ICON,
        default_value: null,
        icon: [],
        is_default:true,
      }, { client: trx })

      const newValue = await Value.create({
        id: value_id,
        feature_id,
        views,
        icon: ( (!icon || icon.length ==0 )? views[0] && [views[0]] : icon)||[],
      }, { client: trx })

      // Commit transaction
      await trx.commit()

      return response.created({ ...product.toJSON(), features: [{ ...feature.toJSON(), values: [newValue.toJSON()] }] })
    } catch (error) {
      await trx.rollback()
      console.error('Error in create_product:', error)
      return response.internalServerError({ message: 'Failed to create product', error: error.message })
    }
  }



  private getPaginationParams(page: string = '1', limit: string = '20'): { pageNum: number; limitNum: number } {
    return {
      pageNum: Math.max(1, parseInt(page)),
      limitNum: Math.max(1, parseInt(limit)),
    }
  }

  private formatResponse(
    response: HttpContext['response'],
    products: ModelPaginatorContract<Product>,
    category?: Categorie | null
  ) {
    const baseResponse = {
      list: products.all(),
      category,
      meta: products.getMeta(),
    }
    return response.ok(baseResponse)
  }

  private applySearch(query: any, search?: string) {
    if (search) {
      const searchTerm = `%${search.toLowerCase().split(' ').join('%')}%`
      query.where((q: any) => {
        q.whereILike('products.name', searchTerm)
          .orWhereILike('products.description', searchTerm)
      })
    }
    return query
  }

  private applyFilters(query: ModelQueryBuilderContract<typeof Product>, filters: Record<string, {
    text: string;
    key: string | null;
  }[]>) {
    Object.entries(filters).forEach(([featureId, filterValues]) => {
      query.whereHas('features', (featureQuery: ModelQueryBuilderContract<typeof Feature>) => {
        featureQuery.where('id', featureId).whereHas('values', (valueQuery) => {
          valueQuery.where((subQuery) => {
            filterValues.forEach((filterValue) => {
              subQuery.orWhere((clause) => {
                clause.where('text', filterValue.text);
                if (filterValue.key !== null) {
                  clause.where('key', filterValue.key);
                } else {
                  clause.whereNull('key');
                }
              });
            });
          });
        });
      });
    });
    return query;
  }

  public async get_products({ request, response, auth }: HttpContext) {
    // await auth.authenticate();
    const {
      product_id,
      search,
      order_by,
      categories_id,
      slug_cat,
      slug_product,
      filters = {},
      page,
      limit,
      min_price,
      max_price,
      with_feature,
    } = request.qs()


    const { pageNum, limitNum } = this.getPaginationParams(page, limit)

    try {
      let products: ModelPaginatorContract<Product>
      let category: Categorie | null = null


      let query = Product.query().select('*')
      if(with_feature == true || with_feature == 'true'){
        query = query.preload('features', (featureQuery) => {
          featureQuery
            .orderBy('features.created_at', 'asc') // 🔥 Trier les features par date de création
            .preload('values', (valueQuery) => {
              valueQuery.orderBy('values.created_at', 'asc') // 🔥 Trier les values par date de création
            });
        })
      }

      if (slug_cat) {
        const categoryIds = await Categorie.get_all_category_ids_by_slug(slug_cat)
        query = query.whereRaw('"categories_id"::jsonb \\?| ?', [categoryIds]);
        category = await Categorie.query()
          .where('slug', slug_cat)
          .select('id', 'name', 'description', 'view')
          .firstOrFail()
        // console.log("🚀 ~ ProductsController ~ get_products ~ category:", category)
      }

      if (slug_product) query = query.where('slug', slug_product)
      if (product_id) query = query.where('id', product_id)
      if (categories_id) {
        let c: string[] = [];
        if (typeof categories_id == 'string') {
          try {
            c = JSON.parse(categories_id);

            if (!Array.isArray(c) || !c.every((id) => typeof id === 'string')) {
              return response.badRequest({ message: 'categories_id doit être un tableau de UUIDs valides' });
            }
          } catch (error) {
            return response.badRequest({ message: 'Format JSON invalide pour categories_id' });
          }
        } else {
          c = categories_id
        }

        if (c.length > 0) {
          query = query.whereRaw('"categories_id"::jsonb \\?| ?', [c]);
        }
      }
      if (min_price || max_price) {
        query = query.whereBetween('price', [
          min_price ?? 0, // Si `min_price` est null, on met 0 par défaut
          max_price ?? 1_000_000_000, // Si `max_price` est null, on met un max
        ]);
      }
      
      if (filters) {
        const filtersTransformed: Record<string, { text: string; key: string | null }[]> = {};
        Object.entries(filters).forEach(([featureId, values]) => {
          filtersTransformed[featureId] = Object.values(values as Record<string, { text: string; key: string | null }>).map(
            (val) => ({
              text: val.text,
              key: val.key === 'null' ? null : val.key,
            })
          );
        });
        query = this.applyFilters(query, filtersTransformed)
      }
      query = this.applySearch(query, search)

      if (order_by) query = applyOrderBy(query, order_by, Product.table)

      products = await query.paginate(pageNum, limitNum)

      return this.formatResponse(response, products, category)

    } catch (error) {
      return response.status(404).json({
        success: false,
        message: error.message || 'Erreur lors de la récupération des produits',
      })
    }
  }
  async update_product({ request, response }: HttpContext) {
    try {
      let {
        product_id,
        name,
        description,
        categories_id,
        barred_price,
        price,
        currency,
      } = request.body()

      console.log({ ['update_product']: request.body() });

      if (!product_id) {
        return response.badRequest({ message: 'product_id is required' })
      }
      const product = await Product.findOrFail(product_id)


      let parsedCategoriesId: string[] | null = null
      if (categories_id !== undefined) {
        try {
          if (typeof categories_id === 'string') {
            parsedCategoriesId = JSON.parse(categories_id)
          } else {
            parsedCategoriesId = categories_id
          }
          if (
            !Array.isArray(parsedCategoriesId) ||
            !parsedCategoriesId.every((id) => typeof id === 'string')
          ) {
            return response.badRequest({
              message: 'categories_id must be an array of strings',
            })
          }
        } catch (e) {
          return response.badRequest({
            message: 'Invalid categories_id format: must be a valid JSON array of strings',
            error: e.message,
          })
        }
      }

      const updates: Partial<Product> = {}
      if (name !== undefined) {
        if (typeof name !== 'string' || name.replace(/\s+/g, ' ') === '') {
          return response.badRequest({ message: 'name must be a non-empty string' })
        }
        updates.name = name.replace(/\s+/g, ' ').substring(0, 56);
      }
      if (description !== undefined) updates.description = description.trim().substring(0, 1024) || null
      if (parsedCategoriesId !== undefined) updates.categories_id = parsedCategoriesId || []
      if (barred_price !== undefined) {
        if (barred_price == '' || barred_price == 'NaN') {
          console.log('################  $$   barred_price   ##################');
          
          updates.barred_price = null
        } else {
          console.log('################  222  barred_price   ##################');
          const barredPriceNum = Number(barred_price)
          if (isNaN(barredPriceNum) || barredPriceNum < 0) {
            return response.badRequest({ message: 'barred_price must be a positive number' })
          }
          updates.barred_price = barredPriceNum
        }

      }
      if (price !== undefined) {
        const priceNum = Number(price)
        if (isNaN(priceNum) || priceNum < 0) {
          return response.badRequest({ message: 'price must be a positive number' })
        }
        updates.price = priceNum
      }

      if (currency !== undefined) {
        if (typeof currency !== 'string' || ![CURRENCY.FCFA, 'USD', 'EUR'].includes(currency)) {
          return response.badRequest({ message: 'currency must be  CFA, USD, EUR' })
        }
        updates.currency = currency
      }

      console.log(updates);

      product.merge(updates)
      await product.save()

      // const features = await Feature.query().preload('values').where('product_id', product.id);
      // const r = {...(product.$attributes),features:features.map(f=>f.toJSON())}
      // console.log(r);
      // return response.ok(r)

      return response.ok(product.$attributes)
    } catch (error) {
      if (error.name === 'ModelNotFoundException') {
        return response.notFound({ message: `Product with ID ${request.input('product_id')} not found` })
      }
      console.error('Error in update_product:', error)
      return response.internalServerError({
        message: 'Failed to update product',
        error: error.message,
      })
    }
  }

  async delete_product({ request, response }: HttpContext) {
    const { id } = request.params()
    const trx = await db.transaction();
    try {
      const product = await Product.find(id, { client: trx })
      if (!product) {
        throw new Error('Product not found')
      }
      const features = await Feature.query({ client: trx }).preload('values').where('product_id', product.id);

      await Promise.allSettled(features?.map(value => FeaturesController._delete_feature(value.id, trx)));
      await product.useTransaction(trx).delete();
      trx.commit();
      return response.ok({ message: 'Product deleted successfully' })
    } catch (error) {
      trx.rollback()
      console.error('Error in delete_product:', error)
      return response.internalServerError({ message: 'Product not deleted', error: error.message })
    }
  }

}