import Product from '#models/product';
import type { HttpContext } from '@adonisjs/core/http'
import { v4 } from 'uuid';
import { applyOrderBy } from './Utils/query.js';
import db from '@adonisjs/lucid/services/db';
import { EXT_SUPPORTED, MEGA_OCTET, STORE_ID } from './Utils/ctrlManager.js';
import Feature from '#models/feature';
import Value from '#models/value';
import { createFiles } from './Utils/FileManager/CreateFiles.js';
import GroupFeature from '#models/group_feature';

export default class ProductsController {
    async create_product(httpContext: HttpContext) {
        const { request, response } = httpContext

        const feature_id = v4();
        const product_id = v4();
        const value_id = v4();
        const group_feature_id = v4();
        let feature = null
        let product = null
        let newValue = null
        let groupFeature = null
        
        const { name, description, price, category_id, barred_price, stock } = request.body();

        if (!name || !description || !price || !stock) {
            return response.badRequest({ message: 'Missing required fields'})
        }
        try {
            product = await Product.create({
                id: product_id,
                name,
                description,
                price,
                store_id: STORE_ID,
                category_id,
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



            newValue = await Value.create({ id: value_id, feature_id, views, additional_price: 0 })
        } catch (error) {
            return response.internalServerError({ message: 'value_default not created - provide at least one image', error: error.message })
        }
        /********************GroupFeature */
        try {
            groupFeature = await GroupFeature.create({ stock, product_id, id: group_feature_id, bind: {} })
        } catch (error) {
            return response.internalServerError({ message: 'groupFeature not created', error: error.message })
        }
        return response.created({ product, newValue, feature, groupFeature })
    }

    async get_products({ request, response, auth }: HttpContext) {
        // await auth.authenticate();
        const { product_id, store_id, search, order_by, category_id, slug ,page = 1, limit = 10 } = request.qs()

        const pageNum = Math.max(1, parseInt(page))
        const limitNum = Math.max(1, parseInt(limit))

        let query = db.from(Product.table).select('*')

        if (store_id) {
            query = query.where('store_id', store_id)
        }

        if (product_id) {
            query = query.where('id', product_id)
        }
        
        if (slug) {
            query = query.where('slug', slug)
            //TODO gere dans une route diferente ave findBy
        }

        if (category_id) {
            query = query.where('category_id', category_id)
        }

        if (search) {
            const searchTerm = `%${search.toLowerCase()}%`
            query.where((q) => {
                q.whereRaw('LOWER(products.name) LIKE ?', [searchTerm])
                    .orWhereRaw('LOWER(products.description) LIKE ?', [searchTerm])
            })
        }

        if (order_by) {
            query = applyOrderBy(query, order_by, Product.table)
        }

        const productsPaginate = await query.paginate(pageNum, limitNum)

        return response.ok({ list: productsPaginate.all(), meta: productsPaginate.getMeta() })
    }

    async update_product({ request, response }: HttpContext) {
        const { product_id, name, description, category_id, barred_price, price, currency } = request.body()
        // const body = request.body();
        try {
            const product = await Product.find(product_id)
            if (!product) {
                return response.notFound({ message: 'Product not found' })
            }
            product.merge({ name, description, category_id, barred_price, price, currency })

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