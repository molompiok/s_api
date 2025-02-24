import Value from '#models/value'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { v4 } from 'uuid'

export default class ValuesController {
    async create_value({ request, response }: HttpContext) {
        try {
          const data = request.only([
            'feature_id',
            'product_id',
            'additional_price',
            'currency',
            'type',
            'icon',
            'text',
            'min',
            'max',
            'min_size',
            'max_size',
            'multiple',
            'is_double',
          ])
    
          // Générer un ID unique pour la valeur
          const value_id = v4()
    
          const newValue = await Value.create({ value_id, ...data })
    
          return response.created(newValue)
        } catch (error) {
          console.error('Error in create_value:', error)
          return response.internalServerError({ message: 'Value not created', error: error.message })
        }
      }


      async get_values({ request, response }: HttpContext) {
        try {
          const { feature_id, product_id, id, type, page = 1, limit = 10 } = request.qs()
    
          const pageNum = Math.max(1, parseInt(page))
          const limitNum = Math.max(1, parseInt(limit))
    
          let query = db.from(Value.table).select('*')
    if (id) {
        query.where('id', id)
    }
          if (feature_id) query.where('feature_id', feature_id)
          if (product_id) query.where('product_id', product_id)
          if (type) query.where('type', type)
    
          const valuesPaginate = await query.paginate(pageNum, limitNum)
    
          return response.ok({ list: valuesPaginate.all(), meta: valuesPaginate.getMeta() })
        } catch (error) {
          console.error('Error in get_values:', error)
          return response.internalServerError({ message: 'Error fetching values', error })
        }
      }

      async update_value({ request, response }: HttpContext) {
        try {
          const { value_id, ...data } = request.only([
            'value_id',
            'feature_id',
            'product_id',
            'additional_price',
            'currency',
            'type',
            'icon',
            'text',
            'min',
            'max',
            'min_size',
            'max_size',
            'multiple',
            'is_double',
          ])
    
          if (!value_id) {
            return response.badRequest({ message: 'Value ID is required' })
          }
    
          const value = await Value.find(value_id)
    
          if (!value) {
            return response.notFound({ message: 'Value not found' })
          }
    
          value.merge(data)
          await value.save()
    
          return response.ok(value)
        } catch (error) {
          console.error('Error in update_value:', error)
          return response.internalServerError({ message: 'Update failed', error: error.message })
        }
      }

      async delete_value({ params, response }: HttpContext) {
        try {
          const value = await Value.find(params.id)
    
          if (!value) {
            return response.notFound({ message: 'Value not found' })
          }
    
          await value.delete()
    
          return response.noContent()
        } catch (error) {
          console.error('Error in delete_value:', error)
          return response.internalServerError({ message: 'Value not deleted', error: error.message })
        }
      }
    
    
}