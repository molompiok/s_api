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
async function getListCategoriesId(categories_id: string) {
  let listIds = [];
  try {
    const a = JSON.parse(categories_id);
    if (Array.isArray(a)) {
      for (const id of a) {
        const c = await Categorie.find(id)
        if (c) listIds.push(id);
      }
    }
  } catch (error) {}
  return listIds
}

export default class ProductsController {
    async create_product(httpContext: HttpContext) {
        const { request, response } = httpContext
        const feature_id = v4();
        const product_id = v4();
        const value_id = v4();
        const group_product_id = v4();
        let feature = null
        let product = null
        let newValue = null
        let groupFeature = null
        
        const { name, description, price, categories_id, barred_price, stock } = request.body();

        console.log(request.all());
        
        
        if (!name || !description || !price ) {
            return response.badRequest({ message: 'Missing required fields'})
        }
        const views = await createFiles({
          request,
          column_name: "views",
          table_id: value_id,
          table_name: Value.table,
          options: {
              throwError: true,
              // compress: 'img',
              min: 1,
              max: 5,
              extname: EXT_SUPPORTED,
              maxSize: 12 * MEGA_OCTET,
          },
      });
      if (views.length == 0) return response.notAcceptable('product view required')
        try {
            product = await Product.create({
                id: product_id,
                name,
                description,
                price,
                store_id: STORE_ID,
                categories_id,
                barred_price,
                default_feature_id: feature_id,
                currency: "CFA",
            })


        } catch (error) {
            console.error('Error in create_product:', error)
            return response.internalServerError({ message: 'Product not created', error: error.message })
        }
        /********************Feature */
        try {
            feature = await Feature.create({ id: feature_id, product_id, name: 'default_feature', required: false, default: null, icon: [] })
        } catch (error) {
            return response.internalServerError({ message: 'default_feature not created', error: error.message })
        }

        /********************Value */
        try {
            newValue = await Value.create({ id: value_id, feature_id, views , })
        } catch (error) {
            return response.internalServerError({ message: 'value_default not created - provide at least one image', error: error.message })
        }
        /********************GroupFeature */
        try {
            groupFeature = await GroupFeature.create({ stock, product_id, id: group_product_id, bind: {} , additional_price: 0 })
        } catch (error) {
            return response.internalServerError({ message: 'groupFeature not created', error: error.message })
        }
        const a: any = product.toJSON();
        a.features=[{...feature,values:[newValue]}];
        a.groups=[groupFeature]
        return response.created(a)
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
          query.where((q : any) => {
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
          category_id,
          slug_cat,
          slug_product,
          filters = {},
          page,
          limit
        } = request.qs()
          console.log("🚀 ~ ProductsController ~ get_products ~ order_by:", order_by)
        
        console.log("🚀 ~ ProductsController ~ get_products ~ filters:", filters)
        const { pageNum, limitNum } = this.getPaginationParams(page, limit)
    
        try {
          let products: ModelPaginatorContract<Product>
          let category: Categorie | null = null
    
          let query = Product.query().select('*').preload('features', (featureQuery) => {
            featureQuery.preload('values')
          })
    
          if (slug_cat) {
            const categoryIds = await Categorie.get_all_category_ids_by_slug(slug_cat)
            query = query.whereIn('category_id', categoryIds)
            category = await Categorie.query()
            .where('slug', slug_cat)
            .select('id', 'name', 'description')
            .firstOrFail()
              
          }
    
          if (store_id) query = query.where('store_id', store_id)
          if (slug_product) query = query.where('slug', slug_product)
          if (product_id) query = query.where('id', product_id)
          if (category_id) query = query.where('category_id', category_id)
    
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
        const { product_id, name, description, categories_id, barred_price, price, currency } = request.body()
        try {
            const product = await Product.find(product_id)
            if (!product) {
                return response.notFound({ message: 'Product not found' })
            }
            product.merge({ name, description, categories_id: categories_id || null, barred_price, price, currency })

            await product.save()

            return response.ok(product)
        } catch (error) {
            console.error('Error in update_product:', error)
            return response.internalServerError({ message: 'Product not updated', error: error.message })
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