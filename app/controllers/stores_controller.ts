import type { HttpContext } from '@adonisjs/core/http'

import Store from "#models/store";
import { v4 } from 'uuid';
import { DateTime } from 'luxon';
import db from '@adonisjs/lucid/services/db';
import { applyOrderBy } from './Utils/query.js';
import { createFiles } from './Utils/FileManager/CreateFiles.js';
import { extSupported, MegaOctet } from './Utils/imgManager.js';
import { updateFiles } from './Utils/FileManager/UpdateFiles.js';

export default class StoresController {

    async create_store({ request, response }: HttpContext) {
      try {
          const {user_id, name, description} = request.only(['user_id', 'name', 'description'])
    
          if (!user_id || !name) {
            return response.badRequest({ message: 'user_id et name sont obligatoires' })
          }
    
          const expire_at = DateTime.now().plus({ days: 14 })
          const disk_storage_limit_gb = 1
          const api_port = 3600
          const url = JSON.stringify([`${name}.sublymus.com`])
          const current_theme_id = v4()
          const store_id = v4()
          const bannerStore = await createFiles({
            request,
            column_name: "banner",
            table_id: store_id,
            table_name: Store.table,
            options: {
                throwError: true,
                compress: 'img',
                min: 1,
                max: 1,
                extname: extSupported,
                maxSize: 12 * MegaOctet,
            },
        });
          const logoStore = await createFiles({
            request,
            column_name: "logo",
            table_id: store_id,
            table_name: Store.table,
            options: {
                throwError: true,
                compress: 'img',
                min: 1,
                max: 1,
                extname: extSupported,
                maxSize: 12 * MegaOctet,
            },
        });
          console.log("🚀 ~ StoresController ~ create_store ~ logoStore:", logoStore)
          const newStore = await Store.create({
            id: store_id,
            name: name,
            description: description || '',
            user_id: user_id,
            api_port,
            url,
            disk_storage_limit_gb,
            expire_at,
            current_theme_id,
            logo : JSON.stringify(logoStore),
            banner : JSON.stringify(bannerStore)
          })
          console.log("🚀 ~ StoresController ~ create_store ~ newStore:", newStore)
    
          return response.created(newStore)
        } catch (error) {
          console.error('Error in create_store:', error)
          return response.internalServerError({ message: 'Store not created', error: error.message })
        }
      }

      async get_stores({ request, response, auth }: HttpContext) {
        try {
          const { store_id, name, order_by, page = 1, limit = 10, user_id } = request.qs()
    
          const pageNum = Math.max(1, parseInt(page))
          const limitNum = Math.max(1, parseInt(limit))
    
          let query = db.from(Store.table).select('*')
    
          if (store_id) {
            query.where('id', store_id)
          }
    
          if (user_id) {
            //TODO ADMIN
            const user = await auth.authenticate()
            query.where('user_id', user.id)
          }
    
          if (name) {
            const searchTerm = `%${name.toLowerCase()}%`
            query.where((q) => {
              q.whereRaw('LOWER(stores.name) LIKE ?', [searchTerm])
                .orWhereRaw('LOWER(stores.description) LIKE ?', [searchTerm])
            })
          }
    
          if (order_by) {
            query = applyOrderBy(query, order_by, Store.table)
          }
    
          // Pagination
          const storesPaginate = await query.paginate(pageNum, limitNum)
    
          return response.ok({ list: storesPaginate.all(),meta:storesPaginate.getMeta() })
        } catch (error) {
          console.error('Error in get_store:', error)
          return response.internalServerError({ message: 'Une erreur est survenue', error })
        }
      }

      async update_store({ request, response, auth }: HttpContext) {
        const user = await auth.authenticate()
        const { name, description, store_id } = request.only(['name', 'description','store_id']);
        const body = request.body();
        try {
    
          const store = await Store.find(store_id)
          if (!store) {
            return response.notFound({ message: 'Store not found' })
          }
    
          if (store.user_id !== user.id) {
            return response.forbidden({ message: 'Unauthorized: You are not the owner of this store' })
          }
    
          store.merge({name ,description})

          let urls = [];

          for (const f of ['banner', 'logo'] as const) {
              if (!body[f]) continue;
  
              urls = await updateFiles({ // non synchrone
                  request,
                  table_name: "products",
                  table_id: store_id,
                  column_name: f,
                  lastUrls: store[f],
                  newPseudoUrls: body[f],
                  options: {
                      throwError: true,
                      min: 1,
                      max: 1,
                      compress: 'img',
                      extname: extSupported,
                      maxSize: 12 * MegaOctet,
                  },
              });
              store[f] = JSON.stringify(urls);
          }
    
          await store.save()
    
          return response.ok(store)
        } catch (error) {
          console.error('Error in update_store:', error)
          return response.internalServerError({ message: 'Update failed', error: error.message })
        }
      }
      
      async delete_store({ request, response, auth }: HttpContext) {
        const user = await auth.authenticate()
        const store_id = request.param('id')
        try {
          if (!store_id) {
            return response.badRequest({ message: 'Store ID is required' })
          }
     
          const store = await Store.find(store_id)
          if (!store) {
            return response.notFound({ message: 'Store not found' })
          }
      
          if (store.user_id !== user.id) {
            return response.forbidden({ message: 'Forbidden operation' })
          }
      
          await store.delete()
      
          return response.ok({ isDeleted: store.$isDeleted })
        } catch (error) {
          console.error('Error in delete_store:', error)
          return response.internalServerError({ message: 'Store not deleted', error: error.message })
        }
      }



}