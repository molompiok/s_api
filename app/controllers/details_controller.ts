import Detail from '#models/detail';
import Product from '#models/product';
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db';
import { v4 } from 'uuid';
import { createFiles } from './Utils/media/CreateFiles.js';
import { EXT_IMAGE, EXT_VIDEO, MEGA_OCTET } from './Utils/ctrlManager.js';
import { updateFiles } from './Utils/media/UpdateFiles.js';
import { applyOrderBy } from './Utils/query.js';
import { deleteFiles } from './Utils/media/DeleteFiles.js';

export default class DetailsController {
    async create_detail({ request, response }: HttpContext) {
        const { description, product_id, title, type } = request.only([
            'product_id',
            'title',
            'description',
            'view',
            'type'
        ])
        console.log(request.body());

        const product = await Product.find(product_id);
        if (!product) {
            return response.notFound({ message: 'Product not found' });
        }

        const id = v4()
        let view = await createFiles({
            request,
            column_name: "view",
            table_id: id,
            table_name: Detail.table,
            options: {
                throwError: true,
                compress: 'img',
                min: 0,
                max: 1,
                extname: [...EXT_IMAGE, ...EXT_VIDEO],
                maxSize: 12 * MEGA_OCTET,
            },
        });

        const trx = await db.transaction();
        try {

            const maxIndex = await Detail.query()
                .where('product_id', product_id)
                .max('index as max')

                const max = maxIndex[0].$extras.max;
            const index = max?? false ? max + 1 : 0
            
            const detail = await Detail.create({
                product_id: product_id,
                title: title,
                description: description,
                view,
                index: index,
                type: type,
                id
            }, { client: trx })

            await trx.commit()
            return response.created(detail);

        } catch (error) {
            await trx.rollback()
            console.error('Error in create_Detail:', error)
            return response.internalServerError({ message: 'Detail not created', error: error.message })
        }
    }
    async get_details({ request, response }: HttpContext) {
        let { product_id, detail_id, id, title, order_by = 'index_desc', description, page = 1, limit = 20 } = request.qs()
        detail_id = detail_id || id
        if (!detail_id && !product_id) {
            return response.badRequest({ message: 'detail_id or product_id is required' });
        }
        try {
            let query = Detail.query()
            if (detail_id) query = query.where('id', detail_id)
            if (product_id) query = query.where('product_id', product_id)
            if (title) query = query.whereLike('title', `%${title}%`)
            if (description) query = query.whereLike('description', `%${description}%`)

            if (order_by) query = applyOrderBy(query, order_by, Detail.table)

            const details = await query.paginate(page, limit)

            return response.ok({ list: details.all(), meta: details.getMeta() })
        } catch (error) {
            console.error('Error in get_Details:', error)
            return response.internalServerError({ message: 'Error fetching Details', error: error.message })
        }
    }
    async update_detail({ request, response }: HttpContext) {
        const { id, detail_id, title, description, index: _index, type } = request.only([
            'id',
            'detail_id',
            'title',
            'description',
            'view',
            'with_list',
            'index',
            'type'
        ])

        const payload = request.body();
        console.log(payload);
        const detail = await Detail.find(id || detail_id);
        if (!detail) {
            return response.notFound({ message: 'Detail not found' });
        }

        let url: string[] = [];

        for (const f of ['view'] as const) {
            if (!payload[f]) continue
            let v: string[] = []
            try {
                v = typeof detail[f] == 'string' ? JSON.parse(detail[f]) : v
                if (!Array.isArray(v)) {
                    continue
                }
            } catch (error) { }

            url = await updateFiles({
                request,
                table_name: Detail.table,
                table_id: detail.id,
                column_name: f,
                lastUrls: v || [],
                newPseudoUrls: payload[f],
                options: {
                    throwError: true,
                    min: 0,
                    max: 1,
                    compress: 'img',
                    extname: [...EXT_IMAGE, ...EXT_VIDEO],
                    maxSize: 12 * MEGA_OCTET,
                },
            });
        }


        try {
            detail.merge({
                ...(title && { title: title.trim().substring(0, 124) }),
                ...(description && { description: description.trim().substring(0, 2000) }),
                ...(url.length > 0 && { view: url }),
                ...(type && { type })
            })
            let index = _index && parseInt(_index)
            if (index !== undefined && index !== detail.index) {
                const productId = detail.product_id
              
                // Récupérer tous les détails du produit, triés par index
                const details = await Detail.query()
                  .where('product_id', productId)
                  .orderBy('index', 'asc')
                index = index <=0 ?0 : index >= details.length? details.length:index; 
                // Supprimer le détail actuel de la liste
                const currentIndex = details.findIndex(d => d.id === detail.id)
                if (currentIndex >= 0) {
                  details.splice(currentIndex, 1)
                }
              
                // Insérer à la nouvelle position
                details.splice(index, 0, detail)
              
                // Réassigner les index
                for (let i = 0; i < details.length; i++) {
                  details[i].index = i
                  await details[i].save()
                }
              }

            await detail.save();

            return response.ok(detail);

        } catch (error) {
            console.error('Error in update_detail:', error)
            return response.internalServerError({ message: 'Detail not updated', error: error.message })
        }
    }
    async delete_detail({ request, response }: HttpContext) {
        const params = request.params()
        if (!params.id) {
            return response.badRequest({ message: 'id is required' });
        }
        const id = params.id
        console.log(request.params(), id);

        const detail = await Detail.find(id);
        if (!detail) {
            return response.notFound({ message: 'Detail not found' });
        }

        try {
            await detail.delete()
            await deleteFiles(detail.id)
            if (detail.$isDeleted) {

                const details = await Detail.query()
                    .where('product_id', detail.product_id)
                    .orderBy('index', 'asc')

                for (let i = 0; i < details.length; i++) {
                    details[i].index = i
                    await details[i].save();
                }

            }
            return response.ok({ isDeleted: true, message: 'Detail deleted successfully' });

        } catch (error) {
            console.error('Error in delete_detail:', error)
            return response.internalServerError({ message: 'Detail not deleted', error: error.message })
        }
    }

}