import Value from '#models/value'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { v4 } from 'uuid'
import { updateFiles } from './Utils/media/UpdateFiles.js'
import { EXT_IMAGE, EXT_VIDEO, MEGA_OCTET } from './Utils/ctrlManager.js'
import { createFiles } from './Utils/media/CreateFiles.js'
import { deleteFiles } from './Utils/media/DeleteFiles.js'
import { MAX_PRICE } from './Utils/constants.js'
import { FeatureInterface, ValueInterface } from './features_controller.js'
import Feature, { FeatureType } from '#models/feature'

const checkValidValue = (feature: FeatureInterface, value: Partial<ValueInterface>) => {
  if (feature.type == FeatureType.COLOR) {
    if (!value.key) {
      /* is valide css color */
      const isColor = /^#[0-9A-Fa-f]{6}$/i.test(value?.key || '');
      if (!isColor) throw new Error(`L\'option(value) couleur doit contenir une key valide, expemle value.key = #00ff00. La value.key (${value.key}) n'est pas valide, dans la value ${JSON.stringify(value)}`)
    }
    if (!value.text || value.text.length < 1) {
      throw new Error(`value.text doit contelir au moins 1 caractere`)
    }
  }
  else if (feature.type == FeatureType.ICON_TEXT || feature.type == FeatureType.TEXT || feature.type == FeatureType.ICON) {
    if (!value.text || value.text.length < 1) {
      throw new Error(`value.text doit contelir au moins 1 caractere`)
    }
  }
}


export default class ValuesController {
  public static async _create_value(request: HttpContext['request'], payload: any, id: string, trx: any) {
    console.log('_create_value ===>', id, payload);

    const feature = await Feature.find(payload.feature_id);
    console.log('a##############');
    checkValidValue((feature as any).$attributes, payload);
    console.log('b##############');
    let distinct = ([...(payload.views || []), ...(payload.icon || [])])?.find(f => f.includes(':'))
    distinct = distinct?.substring(0, distinct.indexOf(':'));

    let views =  await createFiles({
      request,
      column_name: "views",
      table_id: id,
      table_name: Value.table,
      distinct,
      options: {
        throwError: true,
        compress: 'img',
        min: 0,
        max: 5,
        extname: [...EXT_IMAGE, ...EXT_VIDEO],
        maxSize: 12 * MEGA_OCTET,
      },
    });
    let icon = await createFiles({
      request,
      column_name: "icon",
      table_id: id,
      table_name: Value.table,
      distinct,
      options: {
        throwError: true,
        compress: 'img',
        min: 0,
        max: 1,
        extname: EXT_IMAGE,
        maxSize: 5 * MEGA_OCTET,
      },
    });
    
    payload.stock = payload.stock && parseInt(payload.stock)
    payload.index = payload.index && parseInt(payload.index || '1')
    payload.index = payload.index <= 0 ? 1 : payload.index
    payload.additional_price = payload.additional_price && parseFloat(payload.additional_price)
    const newValue = await Value.create({
      stock: payload.stock,
      decreases_stock: !!payload.decreases_stock,
      continue_selling: !!payload.continue_selling,
      index: payload.index,
      additional_price: payload.additional_price,
      currency: payload.currency,
      text: payload.text,
      key: payload.key,
      icon: ((!icon || icon.length ==0 )? views[0] && [views[0]] : icon)||[],
      views,
      feature_id: payload.feature_id,
      id
    }, { client: trx })
    console.log(trx.isCompleted, '🔄 _create_value apres ');
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
      const { feature_id, value_id, text, page=1,limit=20 } = request.qs()

      const query = Value.query()
      if (value_id) query.where('id', value_id)
      if (feature_id) query.where('feature_id', feature_id)
      if (text) query.whereLike('text', `%${text}%`)

      const valuesPaginate = await query.paginate(1, 50)

      return response.ok({ list: valuesPaginate.all(), meta: valuesPaginate.getMeta() })
    } catch (error) {
      console.error('Error in get_values:', error)
      return response.internalServerError({ message: 'Error fetching values', error: error.message })
    }
  }
  public static async _update_value(request: HttpContext['request'], value_id: string, payload: any, trx: any) {
    console.log('_update_value ===>', value_id, payload);

    const feature = await Feature.findOrFail(payload.feature_id);

    checkValidValue((feature as any).$attributes, payload);

    let distinct = ([...(payload.views || []), ...(payload.icon || [])])?.find(f => f.includes(':'))
    distinct = distinct?.substring(0, distinct.indexOf(':'));

    const value = await Value.findOrFail(value_id, { client: trx })
    payload.stock = payload.stock && parseInt(payload.stock)
    payload.index = payload.index && parseInt(payload.index || '1')
    payload.additional_price = payload.additional_price && parseFloat(payload.additional_price)
    value.merge({
      stock: payload.stock > MAX_PRICE ? MAX_PRICE : (payload.stock < 0 ? 0 : payload.stock),
      decreases_stock: !!payload.decreases_stock,
      continue_selling: !!payload.continue_selling,
      index: payload.index,
      additional_price: payload.additional_price > MAX_PRICE ? MAX_PRICE : (payload.additional_price < 0 ? 0 : payload.additional_price),
      currency: payload.currency,
      text: payload.text,
      key: payload.key,
    })
    let urls = [];

    for (const f of ['views', 'icon'] as const) {
      console.log('#############',payload[f]);
      
      if (!payload[f]) continue;
      let v: string[] = []
      try {
        v = typeof value[f] == 'string' ? JSON.parse(value[f]) : v
        if (!Array.isArray(v)) {
          continue
        }
      } catch (error) { }
      
      urls = await updateFiles({
        request,
        table_name: Value.table,
        table_id: value_id,
        column_name: f,
        lastUrls: v,
        distinct,
        newPseudoUrls: payload[f],
        options: {
          throwError: true,
          min: 0,
          max: f == 'views' ? 7 : 1,
          compress: f == 'views' ? 'img' : 'img',
          extname: f == 'views' ? [...EXT_IMAGE, ...EXT_VIDEO] : EXT_IMAGE,
          maxSize: 12 * MEGA_OCTET,
        },
      });
      value[f] = urls.length > 0 ? urls:undefined as any;
    }
    value.icon =( (!value.icon || value.icon.length ==0 )? value.views?.[0] && [value.views?.[0]] : value.icon)||[],
    await value.useTransaction(trx).save()
    return value
  }
  async update_value({ request, response }: HttpContext) {
    const payload = request.only([
      'value_id',
      'id',
      'feature_id',
      'additional_price',
      'currency',
      'icon',
      'views',
      'text',
      'key',
      'stock',
      'decreases_stock',
      'continue_selling',
      'index'
    ]);
    if (!payload.value_id) {
      return response.badRequest({ message: 'Value ID is required' })
    }
    const trx = await db.transaction();
    try {

      const value = await ValuesController._update_value(request, payload.value_id || payload.id, payload, trx)

      await trx.commit()
      response.ok(value)
    } catch (error) {
      await trx.rollback();
      console.error('Error in update_value:', error)
      return response.internalServerError({ message: 'Update failed', error: error.message })
    }
  }
  public static async _delete_value(value_id: string, trx: any) {
    const value = await Value.findOrFail(value_id, { client: trx })
    await value.useTransaction(trx).delete();
    console.log('$$$$$$$$$$', value_id);

    await deleteFiles(value_id)
  }
  async delete_value({ params, response }: HttpContext) {
    const trx = await db.transaction();
    try {

      await ValuesController._delete_value(params.id, trx)
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