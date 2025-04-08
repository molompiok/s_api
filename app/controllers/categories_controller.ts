import type { HttpContext } from '@adonisjs/core/http'
import { v4 } from 'uuid';
import { createFiles } from './Utils/media/CreateFiles.js';
import Categorie from '#models/categorie';
import { EXT_IMAGE, MEGA_OCTET } from './Utils/ctrlManager.js';
import db from '@adonisjs/lucid/services/db';
import { applyOrderBy } from './Utils/query.js';
import { updateFiles } from './Utils/media/UpdateFiles.js';
import { deleteFiles } from './Utils/media/DeleteFiles.js';
import Product from '#models/product';

export default class CategoriesController {
    async get_categories({ response, request, auth }: HttpContext) {
        const { categories_id, search, slug, order_by, page = 1, limit = 1000, user_id, category_id, with_product_count } = request.qs()
        const pageNum = Math.max(1, parseInt(page))
        const limitNum = Math.max(1, parseInt(limit))
    
        try {
            let query = db.from(Categorie.table).select('categories.*')
    
            if (with_product_count) {
                query
                    .select(
                        db.raw(`COALESCE(
                            (SELECT COUNT(*) 
                            FROM products 
                            WHERE products.categories_id @> jsonb_build_array(categories.id)), 0) 
                            AS product_count`)
                    )
            }
    
            if (categories_id) {
                console.log('categories_id',categories_id);
                
                const c = JSON.parse(categories_id)
                if (!Array.isArray(c)) return response.notAcceptable('categories_id must be a JSON Array')
                query = query.whereIn('id', c)
            }
            if (category_id) query = query.where('id', category_id)
            if (slug) query = query.where('slug', slug)
            if (search) {
                const searchTerm = `%${search.toLowerCase().split(' ').join('%')}%`
                query.where(q => {
                    q.whereILike('categories.name', searchTerm)
                        .orWhereILike('categories.description', searchTerm)
                })
            }
            if (user_id) {//TODO role admin
                const user = await auth.authenticate()
                query.where('user_id', user.id)
            }
            if (order_by) query = applyOrderBy(query, order_by, Categorie.table)
    
            const categoriesPaginate = await query.paginate(pageNum, limitNum)
    
            return response.ok({
                list: categoriesPaginate.all(),
                meta: categoriesPaginate.getMeta()
            })
        } catch (error) {
            console.error(error)
            response.internalServerError({ message: 'Internal server error', error: error.message })
        }
    }
    async get_sub_categories({ response, request, auth }: HttpContext) {
        const { category_id } = request.qs()
        try {
            const sub_categories = await Categorie.query().where('parent_category_id', category_id);
            return response.ok(sub_categories)
        } catch (error) {

            response.internalServerError({ message: 'Internal server error', error: error.message })
        }
    }

    async get_filters({ response, request }: HttpContext) {
        let { slug } = request.qs();
        let filters = []
        try {
            if (slug) {

                filters = await Categorie.getAvailableFilters(slug)
            } else {
                filters = await Categorie.getGlobalFilters()
            }
            return response.json(filters)
        } catch (error) {
            return response.status(404).json({ error: error.message })
        }
    }
    async create_category({ request, response, auth }: HttpContext) {
        const data = request.body();
        console.log({ data });

        const { name, description, parent_category_id } = request.only(['name', 'description', 'parent_category_id']);

        const trx = await db.transaction(); // 🔥 Démarrage transaction
        const category_id = v4();
        try {
            if (!name) throw new Error('Information missing');


            const imgCategory = await createFiles({
                request,
                column_name: "view",
                table_id: category_id,
                table_name: Categorie.table,
                options: {
                    compress: 'img',
                    maxSize: 12 * MEGA_OCTET,
                },
            });

            const iconCategory = await createFiles({
                request,
                column_name: "icon",
                table_id: category_id,
                table_name: Categorie.table,
                options: {
                    throwError: true,
                    compress: 'img',
                    min: 1,
                    max: 1,
                    extname: EXT_IMAGE,
                    maxSize: 12 * MEGA_OCTET,
                },
            });

            if (iconCategory.length == 0) throw new Error('Category Icon required');
            if (imgCategory.length == 0) throw new Error('Category View required');

            const newCategory = await Categorie.create({
                id: category_id,
                name: name,
                description: description || '',
                parent_category_id: parent_category_id,
                view: imgCategory,
                icon: iconCategory
            }, { client: trx });

            await trx.commit(); // ✅ Validation transaction
            response.created(newCategory);
        } catch (error) {
            await trx.rollback(); // ❌ Annulation transaction
            response.internalServerError({ message: 'Internal server error in Category', error: error.message });
        }
    }
    async update_category({ request, response, auth }: HttpContext) {
        const body = request.body();
        const { category_id, name, description, parent_category_id } = request.only(['category_id', 'name', 'description', 'parent_category_id']);
        console.log((request.body()));

        const trx = await db.transaction(); // 🔥 Démarrage transaction
        try {
            const category = await Categorie.find(category_id);
            if (!category) throw new Error('Category not found');

            category.useTransaction(trx);
            category.merge({ name, description, parent_category_id: parent_category_id || null });

            for (const f of ['view', 'icon'] as const) {
                let urls = [];
                if (!body[f]) continue;
                urls = await updateFiles({
                    request,
                    table_name: Categorie.table,
                    table_id: category_id,
                    column_name: f,
                    lastUrls: category[f],
                    newPseudoUrls: body[f],
                    options: {
                        throwError: true,
                        min: 1,
                        max: 1,
                        compress: 'img',
                        extname: EXT_IMAGE,
                        maxSize: 12 * MEGA_OCTET,
                    },
                });
                category[f] = urls;
            }

            await category.save();
            await trx.commit(); // ✅ Validation transaction
            return response.ok(category);
        } catch (error) {
            await trx.rollback(); // ❌ Annulation transaction
            console.log(error);
            response.internalServerError({ message: 'Internal server error', error: error.message });
        }
    }

    async delete_category({ request, response, auth }: HttpContext) {
        const { id: category_id } = request.params();
        console.log(category_id);

        if (!category_id) throw new Error('Category not found');

        const trx = await db.transaction(); // 🔥 Démarrage transaction
        try {
            const category = await Categorie.find(category_id);
            if (!category) throw new Error('Category not found');

            const sub_categories = await Categorie.query({ client: trx }).where('parent_category_id', category_id);
            await Promise.allSettled(sub_categories.map(c => new Promise(async (rev) => {
                c.parent_category_id = null;
                await c.useTransaction(trx).save();
                rev(0);
            })))
            if (category.id) {
                const products = await trx.query().from(Product.table).whereRaw('"categories_id"::jsonb \\?| ?', [[category.id]])
                await Promise.allSettled(products.map(p => new Promise(async (rev) => {
                    try {
                        const l = JSON.parse(p.categories);
                        if (Array.isArray(l)) {
                            p.categories = l.filter(p_id => p_id != category_id);
                            await p.useTransaction(trx).save()
                        }
                    } catch (error) {

                    }

                    // await c.useTransaction(trx).save();
                    rev(0);
                })))
            }
            await category.useTransaction(trx).delete();
            await deleteFiles(category_id);

            await trx.commit(); // ✅ Validation transaction
            console.log('############', { isDeleted: category.$isDeleted });

            return response.ok({ isDeleted: true });
        } catch (error) {
            console.log(
                error
            );

            await trx.rollback(); // ❌ Annulation transaction
            response.internalServerError({ message: 'Internal server error', error: error.message });
        }
    }

}