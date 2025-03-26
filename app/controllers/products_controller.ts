import Product from '#models/product';
import type { HttpContext } from '@adonisjs/core/http'
import { v4 } from 'uuid';
import { applyOrderBy } from './Utils/query.js';
import { EXT_SUPPORTED, MEGA_OCTET, STORE_ID } from './Utils/ctrlManager.js';
import Feature from '#models/feature';
import Value from '#models/value';
import { createFiles } from './Utils/FileManager/CreateFiles.js';
import GroupFeature from '#models/group_product';
import Categorie from '#models/categorie';
import { ModelPaginatorContract, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model';
import db from '@adonisjs/lucid/services/db';
import { deleteFiles } from './Utils/FileManager/DeleteFiles.js';


export default class ProductsController {

  async create_product(httpContext: HttpContext) {
    const { request, response } = httpContext
    const feature_id = v4()
    const product_id = v4()
    const value_id = v4()
    const group_product_id = v4()

    const { name, description, price, categories_id, barred_price, stock } = request.body()

    console.log(request.all())

    if (!name || !description || !price) {
      return response.badRequest({ message: 'Missing required fields' })
    }

    try {
      const result = await db.transaction(async (trx) => {
        const fileOptions = {
          request,
          column_name: 'views',
          table_id: value_id,
          table_name: Value.table,
          options: {
            throwError: true,
            min: 1,
            max: 5,
            extname: EXT_SUPPORTED,
            maxSize: 12 * MEGA_OCTET,
          },
        }
        const views = await createFiles(fileOptions)

        if (views.length === 0) {
          throw new Error('Product view required')
        }

        const product = await Product.create(
          {
            id: product_id,
            name,
            description,
            price,
            store_id: STORE_ID,
            categories_id,
            barred_price,
            default_feature_id: feature_id,
            currency: 'CFA',
          },
          { client: trx }
        )

        const feature = await Feature.create(
          {
            id: feature_id,
            product_id,
            name: 'default_feature',
            required: false,
            default_value: null,
            icon: [],
          },
          { client: trx }
        )

        const newValue = await Value.create(
          {
            id: value_id,
            feature_id,
            views,
          },
          { client: trx }
        )

        const groupFeature = await GroupFeature.create(
          {
            stock,
            product_id,
            id: group_product_id,
            bind: {},
            additional_price: 0,
          },
          { client: trx }
        )

        const productData: any = product.toJSON()
        productData.features = [{ ...feature.toJSON(), values: [newValue.toJSON()] }]
        productData.groups = [groupFeature.toJSON()]

        return { productData, views }
      })

      return response.created(result.productData)
    } catch (error) {
      console.error('Error in create_product:', error)

      await deleteFiles(value_id)

      return response.internalServerError({
        message: 'Failed to create product',
        error: error.message,
      })
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
      const searchTerm = `%${search.toLowerCase()}%`
      query.where((q: any) => {
        q.whereRaw('LOWER(products.name) LIKE ?', [searchTerm])
          .orWhereRaw('LOWER(products.description) LIKE ?', [searchTerm])
      })
    }
    return query
  }

  private applyFilters(query: ModelQueryBuilderContract<typeof Product>, filters: Record<string, string[]>) {
    Object.entries(filters).forEach(([featureId, values]) => {
      query.whereHas('features', (featureQuery: ModelQueryBuilderContract<typeof Feature>) => {
        featureQuery
          .where('id', featureId)
          .whereHas('values', (valueQuery) => {
            valueQuery.whereIn('text', values)
          })
      })
    })
    return query
  }

  public async get_products({ request, response, auth }: HttpContext) {
    // await auth.authenticate();
    const {
      product_id,
      store_id,
      search,
      order_by,
      categories_id,
      slug_cat,
      slug_product,
      filters = {},
      page,
      limit
    } = request.qs()

    const { pageNum, limitNum } = this.getPaginationParams(page, limit)

    try {
      let products: ModelPaginatorContract<Product>
      let category: Categorie | null = null

      
      let query = Product.query().select('*').preload('features', (featureQuery) => {
        featureQuery
          .orderBy('features.created_at', 'desc') // 🔥 Trier les features par date de création
          .preload('values', (valueQuery) => {
            valueQuery.orderBy('values.created_at', 'desc') // 🔥 Trier les values par date de création
          });
      })

      if (slug_cat) {
        const categoryIds = await Categorie.get_all_category_ids_by_slug(slug_cat)

        query = query.whereRaw('"categories_id"::jsonb \\?| ?', [categoryIds]);
        category = await Categorie.query()
          .where('slug', slug_cat)
          .select('id', 'name', 'description', 'view')
          .firstOrFail()
        // console.log("🚀 ~ ProductsController ~ get_products ~ category:", category)
      }

      if (store_id) query = query.where('store_id', store_id)
      if (slug_product) query = query.where('slug', slug_product)
      if (product_id) query = query.where('id', product_id)
      if (categories_id) query = query.whereIn('categories_id', categories_id)

      query = this.applyFilters(query, filters)

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
      const {
        product_id,
        name,
        description,
        categories_id,
        barred_price,
        price,
        currency,
      } = request.body()

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
      if (description !== undefined) updates.description = description?.replace(/\s+/g, ' ').substring(0, 1024) || null
      if (parsedCategoriesId !== undefined) updates.categories_id = parsedCategoriesId!
      if (barred_price !== undefined) {
        const barredPriceNum = Number(barred_price)
        if (isNaN(barredPriceNum) || barredPriceNum < 0) {
          return response.badRequest({ message: 'barred_price must be a positive number' })
        }
        updates.barred_price = barredPriceNum
      }
      if (price !== undefined) {
        const priceNum = Number(price)
        if (isNaN(priceNum) || priceNum < 0) {
          return response.badRequest({ message: 'price must be a positive number' })
        }
        updates.price = priceNum
      }
      else updates.price = 0

      if (currency !== undefined) {
        if (typeof currency !== 'string' || !['CFA', 'USD', 'EUR'].includes(currency)) {
          return response.badRequest({ message: 'currency must be  CFA, USD, EUR' })
        }
        updates.currency = currency
      } else {
        //TODO add store.currency si le curency est undefined
      }

      product.merge(updates)
      await product.save()

      return response.ok(product)
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

    try {
      const product = await Product.find(id)
      if (!product) {
        return response.notFound({ message: 'Product not found' })
      }

      await product.delete()

      return response.ok({ message: 'Product deleted successfully' })
    } catch (error) {
      console.error('Error in delete_product:', error)
      return response.internalServerError({ message: 'Product not deleted', error: error.message })
    }
  }

  

}