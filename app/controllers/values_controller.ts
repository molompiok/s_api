import Value from '#models/value'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { v4 } from 'uuid'
import { createFiles } from './Utils/FileManager/CreateFiles.js'
import { EXT_SUPPORTED, MEGA_OCTET } from './Utils/ctrlManager.js'
import { updateFiles } from './Utils/FileManager/UpdateFiles.js'

export default class ValuesController {
  async create_value({ request, response }: HttpContext) {
    try {
      const data = request.only([
        'feature_id',
        'additional_price',
        'currency',
        'icon',
        'text'
      ])

      // Générer un ID unique pour la valeur
      const id = v4()

      if (!data.feature_id && !data.text && !data.additional_price) {
        return response.badRequest({ message: 'Missing required fields' })
      }
     console.log(data);
      //TODO l'offre freemium ne permettra d'ajouter plus de 3 iamges

      const views = await createFiles({
        request,
        column_name: "views",
        table_id: id,
        table_name: Value.table,
        options: {
          throwError: true,
          // compress: 'img',
          min: 0,
          max: 5,
          extname: EXT_SUPPORTED,
          maxSize: 12 * MEGA_OCTET,
        },
      });

      const newValue = await Value.create({ id, ...data, views,feature_id : data.feature_id })

      return response.created(newValue)

    } catch (error) {
      console.error('Error in create_value:', error)
      return response.internalServerError({ message: 'Value not created', error: error.message })
    }
  }


  async get_values({ request, response }: HttpContext) {
    try {
      const { feature_id, value_id, text } = request.qs()

      let query = db.from(Value.table).select('*')
      if (value_id) {
        query.where('id', value_id)
      }
      if (feature_id) query.where('feature_id', feature_id)
      if (text) query.whereLike('type', text)

      const valuesPaginate = await query.paginate(1, 50)

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
      ])
      const body = request.body()

      if (!value_id) {
        return response.badRequest({ message: 'Value ID is required' })
      }

      const value = await Value.find(value_id)

      if (!value) {
        return response.notFound({ message: 'Value not found' })
      }

      value.merge(data)


      let urls = [];

      for (const f of ['views'] as const) {
          if (!body[f]) continue;

          urls = await updateFiles({
              request,
              table_name: "values",
              table_id: value_id,
              column_name: f,
              lastUrls: value[f],
              newPseudoUrls: body[f],
              options: {
                  throwError: true,
                  min: 1,
                  max: 1,
                  // compress: 'img',
                  extname: EXT_SUPPORTED,
                  maxSize: 12 * MEGA_OCTET,
              },
          });
          value[f] = urls;
      }
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