import Product from '#models/product';
import type { HttpContext } from '@adonisjs/core/http'
import { v4 } from 'uuid';
import { createFiles } from './Utils/FileManager/CreateFiles.js';
import { EXT_SUPPORTED, MEGA_OCTET } from './Utils/ctrlManager.js';
import { applyOrderBy } from './Utils/query.js';
import db from '@adonisjs/lucid/services/db';
import { updateFiles } from './Utils/FileManager/UpdateFiles.js';

export default class ProductsController {
    async create_product({ request, response , auth }: HttpContext) {
        await auth.authenticate();
        const { name, description, price, stock, store_id, category_id ,barred_price} = request.body();
        if (!name || !description || !price || !stock || !store_id || !category_id) {
            return response.badRequest({ message: 'Missing required fields' })
        }
        try {
            const id = v4();
            const views = await createFiles({
                request,
                column_name: "views",
                table_id: id,
                table_name: Product.table,
                options: {
                    throwError: true,
                    compress: 'img',
                    min: 1,
                    max: 1,
                    extname: EXT_SUPPORTED,
                    maxSize: 12 * MEGA_OCTET,
                },
            });
            const product = await Product.create({
                id,
                name,
                description,
                price,
                stock,
                store_id,
                category_id,
                barred_price,
                currency : "CFA",
                views : JSON.stringify([views])
            })
            return response.created(product)
            
        } catch (error) {
            console.error('Error in create_product:', error)
            return response.internalServerError({ message: 'Product not created', error: error.message })
        }
    }

    async get_products({ request, response, auth }: HttpContext) {
        await auth.authenticate();
        const { product_id , store_id, name, order_by, category_id, page = 1, limit = 10 } = request.qs()
        
        const pageNum = Math.max(1, parseInt(page))
        const limitNum = Math.max(1, parseInt(limit))
        
        let query = db.from(Product.table).select('*')
        
        if (store_id) {
            query =  query.where('store_id', store_id)
        }

        if (product_id) {
            query =  query.where('id', product_id)
        }

        if (category_id) {
            query =  query.where('category_id', category_id)
        }
        
        if (name) {
            const searchTerm = `%${name.toLowerCase()}%`
            query.where((q) => {
                q.whereRaw('LOWER(products.name) LIKE ?', [searchTerm])
                    .orWhereRaw('LOWER(products.description) LIKE ?', [searchTerm])
            })
        }
        
        if (order_by) {
            query = applyOrderBy(query, order_by, Product.table)
        }
        
        const productsPaginate = await query.paginate(pageNum, limitNum)
        
        return response.ok({ data: productsPaginate.all(),meta:productsPaginate.getMeta() })
    }

    async update_product({ request, response }: HttpContext) {
        const { product_id, name, description, category_id, barred_price, price, currency, stock } = request.body()
        const body = request.body();
        try {
            const product = await Product.find(product_id)
            if (!product) {
                return response.notFound({ message: 'Product not found' })
            }
            
            product.merge({  name, description, category_id, barred_price, price, currency, stock })
            
          let urls = [];

          for (const f of ['views'] as const) {
              if (!body[f]) continue;
  
              urls = await updateFiles({
                  request,
                  table_name: "products",
                  table_id: product_id,
                  column_name: f,
                  lastUrls: product[f],
                  newPseudoUrls: body[f],
                  options: {
                      throwError: true,
                      min: 1,
                      max: 1,
                      compress: 'img',
                      extname: EXT_SUPPORTED,
                      maxSize: 12 * MEGA_OCTET,
                  },
              });
              product[f] = JSON.stringify(urls);
          }
    
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