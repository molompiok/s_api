import Favorite from '#models/favorite';
import Product from '#models/product';
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db';
import { v4 } from 'uuid';
import { applyOrderBy } from './Utils/query.js';

export default class FavoritesController {
    async create_favorite({ request, response }: HttpContext) {
        let { product_id, user_id } = request.body();

        // if(!)
        // const user = await auth.authenticate();
        try {
            const product = await Product.find(product_id)


            if (!product) {
                return response.notFound({ message: 'Product not found' })
            }
            // label = label.trim().toLowerCase()
            let favorite = (await Favorite.query()
                // .where('label', label)
                .where('store_id', product.store_id)
                .andWhere('user_id', user_id)
                // .andWhere('user_id', user.id)
                .andWhere('product_id', product_id).limit(1))[0];
            console.log({ favorite });
            if (favorite) {
                return response.badRequest({ message: 'Favorite already exists' })
            } else {
                console.log({ favorite, po: '66666' });
                const id = v4();
                favorite = await Favorite.create({
                    id,
                    label: 'default',
                    product_id,
                    store_id: product.store_id,
                    // user_id: user.id,
                    user_id: user_id,
                })
                console.log({ favorite, po: '66666' });
                return response.created(favorite)
            }
        } catch (error) {
            return response.badRequest({ message: 'Invalid request' })
        }
    }

    async get_favorites({ request, response, auth }: HttpContext) {
        // const user = await auth.authenticate();
        const { page = 1,
            limit = 10,
            order_by,
            favorite_id,
            label,
            store_id,
            product_id
        } = request.qs();
        try {
            const pageNum = Math.max(1, parseInt(page))
            const limitNum = Math.max(1, parseInt(limit))

            let query = db.from(Favorite.table)
                .innerJoin(Product.table, 'favorites.product_id', 'products.id')
                .select('products.*')
                .select('favorites.*')

            if (favorite_id) {
                query = query.where('id', favorite_id)
            }
            if (label) {
                query = query.where('label', label);
            }
            // if (user.id) {
            //     query = query.where('user_id', user.id)
            // }
            if (store_id) {
                query = query.where('store_id', store_id)
            }
            if (product_id) {
                query = query.where('product_id', product_id)
            }
            if (order_by) {
                query = applyOrderBy(query, order_by, Favorite.table)
            }
            const favoritesPaginate = await query.paginate(pageNum, limitNum);
            return response.ok({ list: favoritesPaginate.all(), meta: favoritesPaginate.getMeta() })

        } catch (error) {
            console.error('Error in get_favorites:', error)
            return response.internalServerError({ message: 'Une erreur est survenue', error })
        }
    }
    async update_favorites({ request, response, auth }: HttpContext) {
        const user = await auth.authenticate();
        const { favorite_id, label } = request.only(['favorite_id', 'label']);
        try {
            const favorite = await Favorite.find(favorite_id)
            if (!favorite) {
                return response.notFound({ message: 'Favorite not found' })
            }
            if (favorite.user_id !== user.id) {
                return response.forbidden({ message: 'Forbidden operation' })
            }
            favorite.merge({ label })
            await favorite.save()
            return response.ok(favorite)
        } catch (error) {
            console.error('Error in update_favorites:', error)
            return response.internalServerError({ message: 'Une erreur est survenue', error })
        }
    }

    async delete_favorite({ request, response, auth }: HttpContext) {
        // const user = await auth.authenticate();
        const id = request.param('id');
        
        try {
            const favorite = await Favorite.find(id)
            if (!favorite) {
                return response.notFound({ message: 'Favorite not found' })
            }
            // if (favorite.user_id !== user.id) {
            //     return response.forbidden({ message: 'Forbidden operation' })
            // }
            await favorite.delete()
            return response.ok({ isDeleted: favorite.$isDeleted})
        } catch (error) {
            console.error('Error in delete_favorites:', error)
            return response.internalServerError({ message: 'Une erreur est survenue', error })
        }
    }
}