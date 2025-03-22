import type { HttpContext } from '@adonisjs/core/http'
import GroupProduct from '#models/group_product'
import { v4 } from 'uuid'
import { applyOrderBy } from './Utils/query.js'
import db from '@adonisjs/lucid/services/db'

export default class GroupProductController {

    async create_group({ request, response }: HttpContext) {
        try { 
            const data = request.only(['product_id', 'stock', 'bind','additional_price'])

            if (!data.product_id || !data.stock || Object.keys(data.bind).length === 0) {
                return response.badRequest({ message: 'productId , stock and bind are required' })
            }

            if (data.bind) {
                try {
                    data.bind = JSON.parse(data.bind);
                    if (typeof data.bind !== 'object' || data.bind === null) {
                        return response.badRequest({ message: 'bind must be a valid JSON object' });
                    }
                } catch (e) {
                    return response.badRequest({ message: 'Invalid bind JSON format' });
                }
            }

            const feature = await GroupProduct.create({ id: v4(), ...data })
            return response.created(feature)
        } catch (error) {
            return response.internalServerError({ message: 'Error creating group feature', error })
        }
    }
    async get_group_by_feature({ request, response }: HttpContext) {
        try {
            const { product_id, feature_key, feature_value } = request.qs();
      
            if (!product_id) return response.badRequest({ message: 'product_id is required' });
    
            const query = GroupProduct.query()
                .select('*')
                .where('product_id', product_id);
    
            if (feature_key && feature_value) {
                query.whereRaw('bind->>? = ?', [feature_key, feature_value]);
            }
    
            const group_features = await query;
    
            if (group_features.length === 0) {
                return response.notFound({ 
                    message: 'No stock found for this group_feature',
                    details: { product_id, feature_key, feature_value }
                });
            }
    
            return response.json(Array.isArray(group_features) ? group_features : [group_features]);
        } catch (error) {
            console.error('Error in get_group_by_feature:', error);
            return response.internalServerError({ 
                message: 'Error fetching stock by feature',
                error: error.message
            });
        }
    }

    async update_group({ request, response }: HttpContext) {
        try {
            const { group_id } = request.only(['group_id'])
            const feature = await GroupProduct.findOrFail(group_id)
            if (!feature) {
                return response.notFound({ message: 'Group feature not found' })
            }

            let {bind , product_id ,stock} = request.only(['product_id', 'stock', 'bind'])
            
            if (bind) {
                try {
                    bind = JSON.parse(bind);
                    if (typeof bind !== 'object' || bind === null) {
                        return response.badRequest({ message: 'bind must be a valid JSON object' });
                    }
                } catch (e) {
                    return response.badRequest({ message: 'Invalid bind JSON format' });
                }
            }
            if (product_id) feature.product_id = product_id;
            if (stock !== undefined) feature.stock = Number(stock);

            
            if (bind && typeof bind === 'object') {
                let currentBind = feature.bind || {};
                Object.keys(bind).forEach((key) => {
                    if (bind[key] === null) {
                        delete currentBind[key];
                    } else {
                        currentBind[key] = bind[key];
                    }
                });
                feature.bind = currentBind;
            }
            await feature.save()

            return response.json(feature)
        } catch (error) {
            return response.internalServerError({ message: 'Error updating group feature', error })
        }
    }
    async get_group_product({ request, response }: HttpContext) {
        try {

            const { product_id, order_by, page = 1, limit = 50, group_feature_id } = request.qs()

            const pageNum = Math.max(1, parseInt(page))
            const limitNum = Math.max(1, parseInt(limit))

            let query = db.from(GroupProduct.table).select('*')

            if (product_id) {
                query = query.where('product_id', product_id)
            }

            if (group_feature_id) {
                query = query.where('id', group_feature_id)
            }

            if (order_by) {
                query = applyOrderBy(query, order_by, GroupProduct.table)
            }

            const featuresPaginate = await query.paginate(pageNum, limitNum)

            return response.ok({ list: featuresPaginate.all(), meta: featuresPaginate.getMeta() })
        } catch (error) {
            return response.internalServerError({ message: 'Error fetching group features', error })
        }
    }
 
    async delete_group({ params, response }: HttpContext) {
        try {
            const feature = await GroupProduct.find(params.id)
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
