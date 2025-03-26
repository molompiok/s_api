import Value from '#models/value'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { v4 } from 'uuid'
import { createFiles } from './Utils/FileManager/CreateFiles.js'
import { EXT_SUPPORTED, MEGA_OCTET } from './Utils/ctrlManager.js'
import { updateFiles } from './Utils/FileManager/UpdateFiles.js'

export default class ValuesController {
  public static async _create_value(request: HttpContext['request'], payload: any, id: string, trx: any) {
    
    // const views = await createFiles({
    //   request,
    //   column_name: "views",
    //   table_id: id,
    //   table_name: Value.table,
    //   options: {
    //     throwError: true,
    //     // compress: 'img',
    //     min: 0,
    //     max: 5,
    //     extname: EXT_SUPPORTED,
    //     maxSize: 12 * MEGA_OCTET,
    //   },
    // });
    payload.stock = payload.stock && parseInt(payload.stock)
    payload.index = payload.index && parseInt(payload.index || '1')
    payload.index = payload.index<=0?1:payload.index
    payload.additional_price = payload.additional_price && parseFloat(payload.additional_price)
    const newValue = await Value.create({  
      stock: payload.stock,
      decreases_stock: !!payload.decreases_stock,
      continue_selling: !!payload.continue_selling,
      index: payload.index,
      additional_price: payload.additional_price,
      currency: payload.currency,
      icon: payload.icon,
      text: payload.text,
      key: payload.key,
      views:[], 
      feature_id: payload.feature_id, 
      id 
    }, { client: trx })
    console.log(trx.isCompleted,'🔄 _create_value apres ');
    return newValue
  }

  async create_value({ request, response }: HttpContext) {
    const data = request.only([
      'feature_id',
      'additional_price',
      'currency',
      'icon',
      'text',
      'key',
      'stock',
      'decreases_stock',
      'continue_selling',
      'index'
    ])
    const id = v4()
    const trx = await db.transaction();
    try {
      if (!data.feature_id && !data.text && !data.additional_price) {
        return response.badRequest({ message: 'Missing required fields' })
      }
      console.log(data);
      //TODO l'offre freemium ne permettra d'ajouter plus de 3 iamges

      const newValue = await ValuesController._create_value(request, data, id, trx)
      await trx.commit()
      return response.created(newValue)

    } catch (error) {
      await trx.rollback()
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
  public static  async _update_value(request: HttpContext['request'], value_id:string ,payload: any, trx: any) {
    const value = await Value.findOrFail(value_id)
    payload.stock = payload.stock && parseInt(payload.stock)
    payload.index = payload.index && parseInt(payload.index || '1')
    payload.additional_price = payload.additional_price && parseFloat(payload.additional_price)
    value.useTransaction(trx).merge({
      stock: payload.stock >1_000_000?1_000_000:(payload.stock < 0?0:payload.stock),
      decreases_stock: !!payload.decreases_stock,
      continue_selling: !!payload.continue_selling,
      index: payload.index,
      additional_price:  payload.additional_price > 1_000_000 ? 1_000_000 : (payload.additional_price < 0?0:payload.additional_price),
      currency: payload.currency,
      icon: payload.icon,
      text: payload.text,
      key: payload.key,
    })
    // let urls = [];

    // for (const f of ['views'] as const) {
    //   if (!payload[f]) continue;

    //   urls = await updateFiles({
    //     request,
    //     table_name: "values",
    //     table_id: payload.value_id,
    //     column_name: f,
    //     lastUrls: value[f],
    //     newPseudoUrls: payload[f],
    //     options: {
    //       throwError: true,
    //       min: 1,
    //       max: 1,
    //       // compress: 'img',
    //       extname: EXT_SUPPORTED,
    //       maxSize: 12 * MEGA_OCTET,
    //     },
    //   });
    //   value[f] = urls;
    // }
    await value.useTransaction(trx).save()
  }
  async update_value({ request, response }: HttpContext) {
    const payload = request.only([
      'value_id',
      'id',
      'feature_id',
      'additional_price',
      'currency',
      'icon',
      'text',
      'key',
      'stock',
      'decreases_stock',
      'continue_selling',
      'index'
    ])
    if (!payload.value_id) {
      return response.badRequest({ message: 'Value ID is required' })
    }
    const trx = await db.transaction();
    try {

      const value = await ValuesController._update_value(request,payload.value_id||payload.id, payload, trx)

      await trx.commit()
      response.ok(value)
    } catch (error) {
      // await deleteFiles(payload.feature_id);
      await trx.rollback();
      console.error('Error in update_value:', error)
      return response.internalServerError({ message: 'Update failed', error: error.message })
    }
  }
  public static  async _delete_value(value_id: string, trx: any) {
    const value = await Value.findOrFail(value_id,{client:trx})
    await value.useTransaction(trx).delete()
  }
  async delete_value({ params, response }: HttpContext) {
    const trx = await db.transaction();
    try {
      
      ValuesController._delete_value(params.id, trx)
      await trx.commit()

      return response.noContent()
    } catch (error) {
      await trx.rollback()
      // await deleteFiles(payload.feature_id);
      console.error('Error in delete_value:', error)
      return response.internalServerError({ message: 'Value not deleted', error: error.message })
    }
  }


}