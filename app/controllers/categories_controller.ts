import type { HttpContext } from '@adonisjs/core/http'
import { v4 } from 'uuid';
import { createFiles } from './Utils/FileManager/CreateFiles.js';
import Categorie from '#models/categorie';
import { EXT_SUPPORTED, MEGA_OCTET, STORE_ID } from './Utils/ctrlManager.js';
import db from '@adonisjs/lucid/services/db';
import { applyOrderBy } from './Utils/query.js';
import Store from '#models/store';
import { updateFiles } from './Utils/FileManager/UpdateFiles.js';
import { deleteFiles } from './Utils/FileManager/DeleteFiles.js';
import Role from '#models/role';

export default class CategoriesController {

    async create_category({ request, response, auth }: HttpContext) {
        const data = request.body()
        console.log({ data });

        const { name, description, parent_category_id } = request.only(['name', 'description', 'parent_category_id'])
        //     const user  = await  auth.authenticate()
        //    if (!(await Role.isAuthorized( user.id , 'create_delete_product'))) {
        //        return response.methodNotAllowed('Not authorized')
        //    } 
        try {
            if (!name) {
                return response.badRequest({ message: 'information missing' })
            }

            const category_id = v4()
            const imgCategory = await createFiles({
                request,
                column_name: "view",
                table_id: category_id,
                table_name: 'categories',
                options: {
                    throwError: false,
                    compress: 'img',
                    min: 1,
                    max: 1,
                    extname: EXT_SUPPORTED,
                    maxSize: 12 * MEGA_OCTET,
                },
            });
            const iconCategory = await createFiles({
                request,
                column_name: "icon",
                table_id: category_id,
                table_name: Categorie.table,
                options: {
                    throwError: false,
                    compress: 'img',
                    min: 1,
                    max: 1,
                    extname: EXT_SUPPORTED,
                    maxSize: 12 * MEGA_OCTET,
                },
            });
            const newCategory = await Categorie.create({
                id: category_id,
                name: name,
                description: description || '',
                parent_category_id: parent_category_id,
                store_id: STORE_ID,
                view: imgCategory,
                icon: iconCategory
            })
            response.created(newCategory)
        } catch (error) {
            response.internalServerError({ message: 'Internal server error in Category', error: error.message })

        }

    }

    async get_categories({ response, request, auth }: HttpContext) {
        const { category_id, search, slug, order_by, page = 1, limit = 10, user_id } = request.qs()
        const pageNum = Math.max(1, parseInt(page))
        const limitNum = Math.max(1, parseInt(limit))
        try {

            let query = db.from(Categorie.table).select('*')

            if (category_id) {
                query = query.where('id', category_id)
            }
            if (slug) {
                query = query.where('slug', slug)
                //TODO gere dans une route diferente ave findBy
            }
            if (search) {
                const searchTerm = `%${search.toLowerCase()}%`
                query.where((q) => {
                    q.whereRaw('LOWER(categories.name) LIKE ?', [searchTerm])
                        .orWhereRaw('LOWER(categories.description) LIKE ?', [searchTerm])
                })
            }
            if (user_id) {
                //TODO ADMIN
                const user = await auth.authenticate()
                query.where('user_id', user.id)
            }
            if (order_by) {
                query = applyOrderBy(query, order_by, Categorie.table)
            }
            const categoriesPaginate = await query.paginate(pageNum, limitNum)
            return response.ok({ list: categoriesPaginate.all(), meta: categoriesPaginate.getMeta() })
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

    async update_category({ request, response, auth }: HttpContext) {
        const user = await auth.authenticate();
        const body = request.body();
        const { category_id, name, description, parent_category_id } = request.only(['category_id', 'name', 'description', 'parent_category_id'])
        try {
            const category = await Categorie.find(category_id)
            if (!category) {
                return response.notFound({ message: 'Category not found' })
            }

            const user_id = (await Store.find(category.store_id))?.user_id
            if (user_id !== user.id) {
                return response.forbidden({ message: 'Unauthorized: You are not the owner of this store' })
            }
            category.merge({ name, description, parent_category_id })


            for (const f of ['view', 'icon'] as const) {
                let urls = [];
                if (!body[f]) continue;
                urls = await updateFiles({ // non synchrone
                    request,
                    table_name: "products",
                    table_id: category_id,
                    column_name: f,
                    lastUrls: category[f],
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
                category[f] = urls;
            }
            await category.save()
            return response.ok(category)
        }
        catch (error) {
            response.internalServerError({ message: 'Internal server error', error: error.message })
        }
    }
    async delete_category({ request, response, auth }: HttpContext) {
        const user = await auth.authenticate();
        const { id: category_id } = request.params()
        console.log(category_id);

        if (!category_id) return response.badRequest({ message: 'Category not found' })
        try {
            const category = await Categorie.find(category_id)
            if (!category) {
                return response.notFound({ message: 'Category not found' })
            }
            if (category.parent_category_id) {
                return response.badRequest({ message: 'Category has subcategories' })
            }
            if (!(await Role.isAuthorized(user.id, 'create_delete_product'))) {
                return response.forbidden({ message: 'Unauthorized: not permitted' })
            }
            // const user_id = (await Store.find(category.store_id))?.user_id
            // if (user_id !== user.id) {
            //     return response.forbidden({ message: 'Unauthorized: You are not the owner of this store' })
            // }
            await category.delete()
            await deleteFiles(category_id);
            return response.ok({ isDeleted: true })
        }
        catch (error) {
            response.internalServerError({ message: 'Internal server error', error: error.message })
        }
    }

}