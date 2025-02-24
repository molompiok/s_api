import Feature from '#models/feature';
import type { HttpContext } from '@adonisjs/core/http'
import { v4 } from 'uuid'
import { createFiles } from './Utils/FileManager/CreateFiles.js';
import { EXT_SUPPORTED, MEGA_OCTET } from './Utils/ctrlManager.js';
import Product from '#models/product';
import { updateFiles } from './Utils/FileManager/UpdateFiles.js';
import { deleteFiles } from './Utils/FileManager/DeleteFiles.js';

export default class FeaturesController {
    public async create_feature({ request, response }: HttpContext) {
        const { product_id, name, required, default: default_value } = request.only(['product_id', 'name','required', 'default'])
        const id = v4();
        if (!product_id || !name || !required || !default_value) {
            return response.badRequest({ message: 'Missing required fields' })
        }
       const produit = await Product.find(product_id)
       if (!produit) {
        return response.notFound({ message: 'Product not found' })
       }
        const icon = await createFiles({
            request,
            column_name: "icon",
            table_id: id,
            table_name: Feature.table,
            options: {
                throwError: true,
                compress: 'img',
                min: 1,
                max: 1,
                extname: EXT_SUPPORTED,
                maxSize: 12 * MEGA_OCTET,
            },
        });
        try {
            const feature = await Feature.create({ id, product_id, name, required, default: default_value , icon : JSON.stringify(icon) })
            return response.ok(feature)
            
        } catch (error) {
            return response.internalServerError({ message: 'Feature not created', error: error.message })
        }
    }

    async get_features({ request, response }: HttpContext) {
        const { product_id , feature_id} = request.qs()
   try {
    if (feature_id) {
        const feature = await Feature.find(feature_id)
        if (!feature) {
            return response.notFound({ message: 'Feature not found' })
        }
        return response.ok(feature)
    }
    const features = await Feature.query().where('product_id', product_id)
    return response.ok(features)
 } catch (error) {
    return response.internalServerError({ message: 'Bad config or server error', error: error.message })
 }
    }

    async update_feature({ request, response }: HttpContext) {
        const { name, required, default_value ,feature_id} = request.only(['name', 'required', 'default_value', 'feature_id'])
        const body = request.body();
        try {
            const feature = await Feature.find(feature_id)
            if (!feature) {
                return response.notFound({ message: 'Feature not found' })
            }
            feature.merge({ name, required, default: default_value })
            let urls = [];

            for (const f of ['icon'] as const) {
                if (!body[f]) continue;
    
                urls = await updateFiles({
                    request,
                    table_name: "features",
                    table_id: feature_id,
                    column_name: f,
                    lastUrls: feature[f],
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
                feature[f] = JSON.stringify(urls);
            }
      
            await feature.save()
            return response.ok(feature)
        } catch (error) {
            return response.internalServerError({ message: 'Bad config or server error', error: error.message })
        }
    }

    async delete_feature({ request, response , auth}: HttpContext) {
       await auth.authenticate()
        const feature_id = request.param('id')

        try {
            const feature = await Feature.find(feature_id)
            if (!feature) {
                return response.notFound({ message: 'Feature not found' })
            }
            await feature.delete()
            await deleteFiles(feature_id);
            return response.ok({ message: 'Feature deleted successfully' })
        } catch (error) {
            return response.internalServerError({ message: 'Bad config or server error', error: error.message })
        }

    }

}