import type { HttpContext } from '@adonisjs/core/http'
import GroupFeature from '#models/group_feature'
import { v4 as uuidv4 } from 'uuid'
import { applyOrderBy } from './Utils/query.js'
import db from '@adonisjs/lucid/services/db'

export default class GroupFeaturesController {

    async create_group({ request, response }: HttpContext) {
        try {
            const data = request.only(['productId', 'stock', 'bind'])

            if (!data.productId || !data.stock) {
                return response.badRequest({ message: 'productId and stock are required' })
            }

            const feature = await GroupFeature.create({ id: uuidv4(), ...data })
            return response.created(feature)
        } catch (error) {
            return response.internalServerError({ message: 'Error creating group feature', error })
        }
    }

    async update_group({ request, response }: HttpContext) {
        try {
            const { id } = request.only(['id'])
            const feature = await GroupFeature.find(id)
            if (!feature) {
                return response.notFound({ message: 'Group feature not found' })
            }

            const {bind , product_id ,stock} = request.only(['product_id', 'stock', 'bind'])

            if (product_id) feature.product_id = product_id
            if (stock !== undefined) feature.stock = stock

            
            // Mise à jour fine du JSON `bind`
            if (bind && typeof bind === 'object') {
                Object.keys(bind).forEach((key) => {
                    if (bind[key] === null) {
                        // 🛑 Supprimer une clé de `bind`
                        feature.$attributes.bind = db.raw(`bind - '${key}'`)
                    } else {
                        // ✅ Ajouter ou mettre à jour une clé spécifique dans `bind`
                        feature.$attributes.bind = db.raw(`jsonb_set(bind, '{${key}}', ?)`, [JSON.stringify(bind[key])])
                    }
                })
            }
            await feature.save()

            return response.json(feature)
        } catch (error) {
            return response.internalServerError({ message: 'Error updating group feature', error })
        }
    }
    async get_group_features({ request, response }: HttpContext) {
        try {

            const { product_id, order_by, page = 1, limit = 50, group_feature_id } = request.qs()

            const pageNum = Math.max(1, parseInt(page))
            const limitNum = Math.max(1, parseInt(limit))

            let query = db.from(GroupFeature.table).select('*')

            if (product_id) {
                query = query.where('product_id', product_id)
            }

            if (group_feature_id) {
                query = query.where('id', group_feature_id)
            }

            if (order_by) {
                query = applyOrderBy(query, order_by, GroupFeature.table)
            }

            const featuresPaginate = await query.paginate(pageNum, limitNum)

            return response.ok({ list: featuresPaginate.all(), meta: featuresPaginate.getMeta() })
        } catch (error) {
            return response.internalServerError({ message: 'Error fetching group features', error })
        }
    }
    async get_stock_by_feature({ request, response }: HttpContext) {
        try {
            const { product_id, featureKey, featureValue } = request.qs()

            if (!product_id || !featureKey || !featureValue) {
                return response.badRequest({ message: 'Missing query parameters: productId, featureKey, featureValue' })
            }

            const feature = await GroupFeature.query()
                .where('product_id', product_id)
                .whereRaw(`bind->>? = ?`, [featureKey, featureValue])
                .first()

            if (!feature) {
                return response.notFound({ message: 'No stock found for this feature' })
            }

            return response.json({ stock: feature.stock })
        } catch (error) {
            return response.internalServerError({ message: 'Error fetching stock by feature', error })
        }
    }
    async delete_group({ params, response }: HttpContext) {
        try {
            const feature = await GroupFeature.find(params.id)
            if (!feature) {
                return response.notFound({ message: 'Group feature not found' })
            }

            await feature.delete()
            return response.noContent()
        } catch (error) {
            return response.internalServerError({ message: 'Error deleting group feature', error })
        }
    }


}
