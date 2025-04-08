import Favorite from '#models/favorite';
import Product from '#models/product';
import type { HttpContext } from '@adonisjs/core/http';
import db from '@adonisjs/lucid/services/db';
import { v4 } from 'uuid';
import { applyOrderBy } from './Utils/query.js';

export default class FavoritesController {
    async create_favorite({ request, response, auth }: HttpContext) {
        const { product_id } = request.body();
        if (!product_id) throw new Error('Product ID is required');

        const user = await auth.authenticate();
        const trx = await db.transaction(); // 🔥 Démarrage transaction

        try {
            const product = await Product.find(product_id);
            if (!product) throw new Error('Product not found');

            const existingFavorite = await Favorite.query()
                .andWhere('user_id', user.id)
                .andWhere('product_id', product_id)
                .first();

            if (existingFavorite) throw new Error('Favorite already exists');

            const favorite = await Favorite.create({
                id: v4(),
                label: 'default',
                product_id,
                user_id: user.id,
            }, { client: trx });

            await trx.commit(); // ✅ Valider la transaction
            return response.created({ favorite_id: favorite.id, product_name: product.name });
        } catch (error) {
            await trx.rollback(); // ❌ Annuler la transaction en cas d'erreur
            console.error('Error creating favorite:', error);
            return response.internalServerError({ message: 'Invalid request', error: error.message });
        }
    }

    async get_favorites({ request, response, auth }: HttpContext) {
        const user = await auth.use('web').authenticate();
        if (!user) return response.unauthorized({ message: 'Non authentifié' });

        const { page = 1, limit = 10, order_by, favorite_id, label, product_id } = request.qs();
        console.log("🚀 ~ FavoritesController ~ get_favorites ~ order_by:", order_by)

        try {
            const pageNum = Math.max(1, parseInt(page));
            const limitNum = Math.max(1, parseInt(limit));

            let query = db.from(Favorite.table)
                .innerJoin(Product.table, 'favorites.product_id', 'products.id')
                .select('products.*')
                .select('favorites.*')
                .where('favorites.user_id', user.id);

            if (favorite_id) query = query.where('favorites.id', favorite_id);
            if (label) query = query.where('favorites.label', label);
            if (product_id) query = query.where('favorites.product_id', product_id);
            if (order_by) query = applyOrderBy(query, order_by, Favorite.table);

            const favoritesPaginate = await query.paginate(pageNum, limitNum);
            return response.ok({ list: favoritesPaginate.all(), meta: favoritesPaginate.getMeta() });
        } catch (error) {
            console.error('Error in get_favorites:', error);
            return response.internalServerError({ message: 'Une erreur est survenue', error: error.message });
        }
    }

    async update_favorites({ request, response, auth }: HttpContext) {
        const user = await auth.authenticate();
        const { favorite_id, label } = request.only(['favorite_id', 'label']);
        if (!favorite_id || !label) throw new Error('Missing required fields');

        const trx = await db.transaction(); // 🔥 Démarrage transaction
        try {
            const favorite = await Favorite.find(favorite_id);
            if (!favorite) throw new Error('Favorite not found');
            if (favorite.user_id !== user.id) throw new Error('Forbidden operation');

            favorite.useTransaction(trx);
            favorite.merge({ label });
            await favorite.save();

            await trx.commit(); // ✅ Valider la transaction
            return response.ok(favorite);
        } catch (error) {
            await trx.rollback(); // ❌ Annuler la transaction
            console.error('Error in update_favorites:', error);
            return response.internalServerError({ message: 'Une erreur est survenue', error: error.message });
        }
    }

    async delete_favorite({ request, response, auth }: HttpContext) {
        const user = await auth.authenticate();
        const favorite_id = request.param('id');
        if (!favorite_id) throw new Error('Favorite ID is required');

        const trx = await db.transaction(); // 🔥 Démarrage transaction
        try {
            const favorite = await Favorite.find(favorite_id);
            if (!favorite) throw new Error('Favorite not found');
            if (favorite.user_id !== user.id) throw new Error('Forbidden operation');

            await favorite.useTransaction(trx).delete();
            await trx.commit(); // ✅ Valider la transaction

            return response.ok({ isDeleted: true });
        } catch (error) {
            await trx.rollback(); // ❌ Annuler la transaction
            console.error('Error in delete_favorite:', error);
            return response.internalServerError({ message: 'Une erreur est survenue', error: error.message });
        }
    }
}
