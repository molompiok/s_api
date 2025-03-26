import type { HttpContext } from '@adonisjs/core/http'
import GroupProduct from '#models/group_product'
import { v4 } from 'uuid'
import { applyOrderBy } from './Utils/query.js'
import db from '@adonisjs/lucid/services/db'
import Feature from '#models/feature'
import Value from '#models/value'

export default class GroupProductController {

  /*
  bind:{
    --feature-id--: --value-id--,
    --feature-id--: --value-id--,
    ...
  },
  additional_price: 0,
  stock: 0,
  product_id: --product-id--
  decreases_stock: boolean
  continue_selling: boolean
  */
//   public static async  generateGroupProduct(bind:Record<string, string>, product:any) {
//     let additionalPrice = 0;
//     let stock:number|null = Infinity; // On prend le minimum donc on part d'un grand nombre
//     let decreasesStock = false;
//     let continueSelling = false;

//     // Vérifier les features et récupérer les infos des valeurs sélectionnées
//     for (let feature of product.features) {
//         let featureId = feature.id;
//         let valueId = bind[featureId];

//         if (!valueId) continue; // Si la feature n'est pas dans le bind, on passe

//         let value = feature.values.find((v :any)=> v.id === valueId);
//         if (!value) continue; // Si la valeur n'existe pas, on passe

//         // Mettre à jour le prix supplémentaire
//         if (value.additional_price) {
//             additionalPrice += value.additional_price;
//         }

//         // Mettre à jour le stock (on prend le minimum)
//         if (value.stock !== null) {
//             stock = Math.min(stock, value.stock);
//         }

//         // Mettre à jour les booléens s'ils sont définis
//         if (value.decreases_stock !== null) {
//             decreasesStock = decreasesStock || value.decreases_stock;
//         }
//         if (value.continue_selling !== null) {
//             continueSelling = continueSelling || value.continue_selling;
//         }
//     }

//     // Si aucun stock n'a été défini (aucune valeur n'a de stock renseigné), on met stock = null
//     if (stock === Infinity) {
//         stock = null;
//     }

//     return {
//         bind,
//         additional_price: additionalPrice,
//         stock: stock,
//         product_id: product.id,
//         decreases_stock: decreasesStock,
//         continue_selling: continueSelling
//     };
// }

  // public static async bindNameValue(objBind: Record<string, string>,onError?: (message: string) => void) {
  //   const bindEntries = Object.entries(objBind) as [string, string][]
  //   const binNames: Record<string, string> = {}

  //   for (const [featureId, valueId] of bindEntries) {
  //     const feature = await Feature.find(featureId)
  //     if (!feature) {
  //       return onError?.(`Feature with ID ${featureId} not found`)
  //     }

  //     const value = await Value.find(valueId)
  //     if (!value) {
  //       return onError?.(`Value with ID ${valueId} not found for feature ${featureId}`)
  //     }

  //     binNames[feature.name] = value.text
  //   }
  //   return binNames
  // }

  // async create_group({ request, response }: HttpContext) {
  //   try {
  //     const data = request.only(['product_id', 'stock', 'bind', 'additional_price'])

  //     if (!data.product_id || data.stock === undefined || !data.bind) {
  //       return response.badRequest({
  //         message: 'product_id, stock, and bind are required',
  //       })
  //     }

  //     let objBind
  //     try {
  //       objBind = typeof data.bind === 'string' ? JSON.parse(data.bind) : data.bind
  //       if (!objBind || typeof objBind !== 'object' || Array.isArray(objBind)) {
  //         return response.badRequest({
  //           message: 'bind must be a valid JSON object ( {"featureId": "valueId"})',
  //         })
  //       }
  //     } catch (e) {
  //       return response.badRequest({
  //         message: 'Invalid bind JSON format',
  //         error: e.message,
  //       })
  //     }

  //     const binNames = await GroupProductController.bindNameValue(objBind, (message) => {
  //       return response.badRequest({ message })
  //     })

  //     if (!binNames || Object.keys(binNames).length === 0) {
  //       return response.badRequest({
  //         message: 'bind must contain at least one valid feature-value pair',
  //       })
  //     }

  //     const groupProduct = await GroupProduct.create({
  //       id: v4(),
  //       product_id: data.product_id,
  //       stock: Number(data.stock),
  //       bind: objBind,
  //       additional_price: data.additional_price ? Number(data.additional_price) : 0,
  //     })

  //     return response.created({ ...groupProduct, binNames})
  //   } catch (error) {
  //     return response.internalServerError({
  //       message: 'Error creating group product',
  //       error: error.message,
  //     })
  //   }
  // }

  // async get_group_by_feature({ request, response }: HttpContext) {
  //   try {
  //     const { product_id, feature_key, feature_value } = request.qs();

  //     if (!product_id) return response.badRequest({ message: 'product_id is required' });

  //     const query = GroupProduct.query()
  //       .select('*')
  //       .where('product_id', product_id);

  //     if (feature_key && feature_value) {
  //       query.whereRaw('bind->>? = ?', [feature_key, feature_value]);
  //     }

  //     const group_features = await query;
  //     const promises = group_features.map(g=>new Promise(async (resolve)=>{
  //       if(g.bind){
  //         const binNames = await GroupProductController.bindNameValue(g.bind)
  //         resolve({...g, binNames})
  //       }else{
  //         resolve(g);
  //       }
  //     }))
  //     const data = await Promise.all(promises)
  //     return response.json(data);
  //   } catch (error) {
  //     console.error('Error in get_group_by_feature:', error);
  //     return response.internalServerError({
  //       message: 'Error fetching stock by feature',
  //       error: error.message
  //     });
  //   }
  // }

  // async update_group({ request, response }: HttpContext) {
  //   try {
  //     const { group_id } = request.only(['group_id'])
  //     if (!group_id) {
  //       return response.badRequest({ message: 'group_id is required' })
  //     }

  //     const groupProduct = await GroupProduct.findOrFail(group_id)

  //     const { product_id, stock, bind } = request.only(['product_id', 'stock', 'bind'])

  //     if (product_id) groupProduct.product_id = product_id
  //     if (stock !== undefined) {
  //       const stockNum = Number(stock)
  //       if (isNaN(stockNum)) {
  //         return response.badRequest({ message: 'stock must be a positive number' })
  //       }
  //       groupProduct.stock = stockNum
  //     }

  //     if (bind !== undefined) {
  //       let objBind
  //       try {
  //         objBind = typeof bind === 'string' ? JSON.parse(bind) : bind
  //         if (objBind && (typeof objBind !== 'object' || Array.isArray(objBind))) {
  //           return response.badRequest({
  //             message: 'bind must be a valid JSON object ( {"featureId": "valueId"})',
  //           })
  //         }
  //       } catch (e) {
  //         return response.badRequest({
  //           message: 'Invalid bind JSON format',
  //           error: e.message,
  //         })
  //       }

  //       if (objBind) {
  //         const transformedBind: Record<string, string> = { ...groupProduct.bind }

  //         const bindEntries = Object.entries(objBind) as [string, string][]
  //         for (const [featureId, valueId] of bindEntries) {
  //           if (valueId === null) {
  //             const feature = await Feature.find(featureId)
  //             if (feature && transformedBind[feature.name]) {
  //               delete transformedBind[feature.name]
  //             }
  //             continue
  //           }

  //           const feature = await Feature.find(featureId)
  //           if (!feature) {
  //             return response.badRequest({
  //               message: `Feature with ID ${featureId} not found`,
  //             })
  //           }

  //           const value = await Value.find(valueId)
  //           if (!value) {
  //             return response.badRequest({
  //               message: `Value with ID ${valueId} not found for feature ${featureId}`,
  //             })
  //           }

  //           transformedBind[feature.name] = value.text
  //         }

  //         groupProduct.bind = transformedBind
  //       } else {
  //         groupProduct.bind = null
  //       }
  //     }

  //     await groupProduct.save()

  //     return response.ok({
  //       message: 'Group product updated successfully',
  //       data: groupProduct,
  //     })
  //   } catch (error) {
  //     return response.internalServerError({
  //       message: 'Error updating group product',
  //       error: error.message,
  //     })
  //   }
  // }
  // async get_group_product({ request, response }: HttpContext) {
  //   try {

  //     const { product_id, order_by, page = 1, limit = 50, group_feature_id } = request.qs()

  //     const pageNum = Math.max(1, parseInt(page))
  //     const limitNum = Math.max(1, parseInt(limit))

  //     let query = db.from(GroupProduct.table).select('*')

  //     if (product_id) {
  //       query = query.where('product_id', product_id)
  //     }

  //     if (group_feature_id) {
  //       query = query.where('id', group_feature_id)
  //     }

  //     if (order_by) {
  //       query = applyOrderBy(query, order_by, GroupProduct.table)
  //     }

  //     const featuresPaginate = await query.paginate(pageNum, limitNum)

  //     return response.ok({ list: featuresPaginate.all(), meta: featuresPaginate.getMeta() })
  //   } catch (error) {
  //     return response.internalServerError({ message: 'Error fetching group features', error })
  //   }
  // }

  // async delete_group({ params, response }: HttpContext) {
  //   try {
  //     const feature = await GroupProduct.find(params.id)
  //     if (!feature) {
  //       return response.notFound({ message: 'Group feature not found' })
  //     }

  //     await feature.delete()
  //     return response.noContent()
  //   } catch (error) {
  //     return response.internalServerError({ message: 'Error deleting group feature', error })
  //   }
  // }


}
