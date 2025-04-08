import Feature, { FeatureType } from '#models/feature';
import type { HttpContext } from '@adonisjs/core/http'
import { v4 } from 'uuid'
import { createFiles } from './Utils/media/CreateFiles.js';
import { EXT_IMAGE, MEGA_OCTET } from './Utils/ctrlManager.js';
import Product from '#models/product';
import { updateFiles } from './Utils/media/UpdateFiles.js';
import { deleteFiles } from './Utils/media/DeleteFiles.js';
import db from '@adonisjs/lucid/services/db';
import ValuesController from './values_controller.js';

export interface ValueInterface {
    id?: string;
    feature_id?: string;
    views?: string[] | null;
    icon?: string[] | null;
    text?: string | null;
    key?: string | null;
    stock?: number | null
    decreases_stock?: boolean,
    continue_selling?: boolean
    index: number;
    created_at: string | Date;
    updated_at: string | Date;
};

export interface FeatureInterface {
    id?: string,
    product_id?: string,
    name?: string,
    type?: FeatureType,
    icon?: string,
    required?: boolean,
    regex?: string,
    min?: number,
    max?: number,
    min_size?: number,
    max_size?: number,
    index?: number,
    multiple?: boolean,
    is_double?: boolean,
    default_value?: string,
    created_at: string,
    updated_at: string,
    values?: ValueInterface[];
};


const FileMaxSize = 2 * MEGA_OCTET;

export default class FeaturesController {
    private async _create_feature(request: HttpContext['request'], product_id: string, feature: Partial<FeatureInterface> & { id: string }, trx: any) {
        console.log('🔄 createFiles avant ', trx.isCompleted);

        // const icon = await createFiles({
        //     request,
        //     column_name: "icon",
        //     table_id: feature.id,
        //     table_name: Feature.table,
        //     options: {
        //         throwError: false,
        //         compress: 'img',
        //         min: 0,
        //         max: 1,
        //         extname: EXT_IMAGE,
        //         maxSize: 1 * MEGA_OCTET,
        //     },
        // });
        console.log('🔄 createFiles pres ', trx.isCompleted);

        feature.min_size = parseInt(feature.min_size?.toString() || '0');
        feature.max_size = parseInt(feature.max_size?.toString() || '0');
        feature.max = parseInt(feature.max?.toString() || '0');
        feature.min = parseInt(feature.min?.toString() || '0');
        feature.index = parseInt(feature.index?.toString() || '1');
        const data = {
            id: feature.id,
            product_id: product_id,
            name: feature.name?.replace(/\s+/g, ' ').substring(0, 56),
            default_value: feature.default_value?.substring(0, 52),
            type: Object.values(FeatureType).includes((feature as any).type) ? feature.type as any : FeatureType.TEXT,
            // icon,
            regex: feature.regex?.substring(0, 1024),
            min_size: isNaN(feature.min_size) ? 0 : feature.min_size,
            max_size: isNaN(feature.max_size) ? 0 : feature.min_size,
            max: isNaN(feature.max) ? 0 : feature.min_size,
            min: isNaN(feature.min) ? 0 : feature.min_size,
            index: isNaN(feature.index) ? 1 : feature.index > 0 ? feature.index : 1,
            required: !!feature.required,
            multiple: !!feature.multiple,
            is_double: !!feature.is_double,
        }
        console.log(trx.isCompleted, '🔄 _create_feature avant ', data);

        const newFeature = await Feature.create(data, { client: trx });
        console.log(trx.isCompleted, '🔄 _create_feature apres ');

        return newFeature
    }

    public async create_feature({ request, response }: HttpContext) {
        // const payload = await CreateFeatureValidator.validate({
        //     data: request.body(),
        //     messages: CreateFeatureMessage
        // });
        const payload = request.body();
        if (!payload.product_id || !payload.name || !payload.type) {
            return response.badRequest({ message: 'Missing required fields' });
        }

        const id = v4();
        const trx = await db.transaction();

        try {
            const product = await Product.findOrFail(payload.product_id, { client: trx });
            if (!product) return response.notFound({ message: 'Product not found' });

            const feature = await this._create_feature(request, product.id, { ...payload, id }, trx);

            await trx.commit();
            return response.ok(feature);

        } catch (error) {
            await deleteFiles(id);
            await trx.rollback();
            return response.internalServerError({ message: 'Feature not created', error: error.message });
        }
    }

    async get_features({ request, response }: HttpContext) {
        // const payload = await GetFeaturesValidator.validate({
        //     data: request.qs(),
        //     messages: GetFeaturesMessage
        // });

        const payload = request.qs()
        console.log("🚀 ~ FeaturesController ~ get_features ~ payload:", payload)
        try {
            let query = db.from(Feature.table).select('*');
            if (payload.feature_id) query.where('id', payload.feature_id);
            if (payload.product_id) query.where('product_id', payload.product_id);
            const valuesPaginate = await query.paginate(1, 50);
            return response.ok({ list: valuesPaginate.all(), meta: valuesPaginate.getMeta() });
        } catch (error) {
            return response.internalServerError({ message: 'Bad config or server error', error: error.message });
        }
    }

 async get_features_with_values({ request, response }: HttpContext) {
    try {
        const { feature_id, product_id } = request.qs();

        const query = Feature.query().preload('values');

        if (feature_id) query.where('id', feature_id);
        if (product_id) query.where('product_id', product_id);

        const features = await query;

        if (!features.length) {
            return response.notFound({ message: 'Feature not found' });
        }

        return response.ok(features);
    } catch (error) {
        return response.internalServerError({
            message: 'Server error',
            error: error.message,
        });
    }
}
    async _update_feature(
        request: HttpContext['request'],
        feature_id: string,
        feature: Partial<FeatureInterface>,
        trx: any
      ) {
        const f = await Feature.findOrFail(feature_id, { client: trx });

        feature.min_size = parseInt(feature.min_size?.toString() || '0');
        feature.max_size = parseInt(feature.max_size?.toString() || '0');
        feature.max = parseInt(feature.max?.toString() || '0');
        feature.min = parseInt(feature.min?.toString() || '0');
        feature.index = parseInt(feature.index?.toString() || '1');
 

        let urls = [];
        for (const i of ['icon'] as const) {
            if (!feature[i]) continue;
            urls = await updateFiles({
                request,
                table_name: Feature.table,
                table_id: feature_id,
                column_name: i,
                lastUrls: f[i],
                newPseudoUrls: feature[i],
                options: {
                    throwError: true,
                    min: 0,
                    max: 1,
                    compress: 'img',
                    extname: EXT_IMAGE,
                    maxSize: 12 * MEGA_OCTET,
                },
            });
            f[i] = urls;
        }
        f.useTransaction(trx).merge({
            name: feature.name?.replace(/\s+/g, ' ').substring(0, 56),
            default_value: feature.default_value?.substring(0, 52),
            type: Object.values(FeatureType).includes((feature as any).type) ? feature.type as any : FeatureType.TEXT,
            regex: feature.regex?.substring(0, 1024),
            min_size: isNaN(feature.min_size) ? 0 : feature.min_size,
            max_size: isNaN(feature.max_size) ? 0 : feature.min_size,
            max: isNaN(feature.max) ? 0 : feature.min_size,
            min: isNaN(feature.min) ? 0 : feature.min_size,
            index: isNaN(feature.index) ? 1 : feature.index > 0 ? feature.index : 1,
            required: !!feature.required,
            multiple: !!feature.multiple,
            is_double: !!feature.is_double,
        });
        await f.useTransaction(trx).save();

        return f;
    }

    async update_feature({ request, response }: HttpContext) {
        const payload = request.body();
        const trx = await db.transaction();
        if (!payload.feature_id) return response.badRequest({ message: 'feature_id is required' });
        try {

            const feature = await this._update_feature( request, payload.feature_id, payload, trx);

            await trx.commit();
            return response.ok(feature);
        } catch (error) {
            await trx.rollback();
            return response.internalServerError({ message: 'Bad config or server error', error: error.message });
        }
    }

    async multiple_update_features_values({ request, response }: HttpContext) {
        const { multiple_update_features, product_id } = request.body();
        
        if (!product_id || !multiple_update_features) {
            return response.badRequest({ message: 'Missing required fields' });
        }
    
        const trx = await db.transaction();
        try {
            const Allfeatures = JSON.parse(multiple_update_features) as {
                values: Record<string, { create_values: any[]; update_values: any[]; delete_values_id: string[] }>;
                create_features: FeatureInterface[];
                update_features: FeatureInterface[];
                delete_features_id: string[];
            };
            console.log(request.allFiles());
            
            
            const product = await Product.findOrFail(product_id, { client: trx });
    
            // Fetch all features in a single query
            const localFeatures = await Feature.query({ client: trx }).preload('values').where('product_id', product_id);
    
            // Bulk update features
            for (const feature of Allfeatures.update_features||[]) {
                if (!feature.id) continue;
                const existingFeature = localFeatures.find(f => f.id === feature.id);
                if (!existingFeature) continue;
                await this._update_feature( request, feature.id, feature, trx);
            }
    
            // Bulk create features and their values
            for (const feature of Allfeatures.create_features||[]) {
                feature.product_id = product_id;
                const id = v4();
                const createdFeature = await this._create_feature(request, product.id, {...feature, id}, trx);
    
                if (feature.values) {
                    for (const value of feature.values) {
                        console.log({createdFeature});
                        
                        await ValuesController._create_value(request, { ...value, feature_id: id }, v4(), trx);
                    }
                }
            }
    
            // Bulk delete features and their values
            for (const feature_id of Allfeatures.delete_features_id||[]) {
                if (feature_id === product.default_feature_id) continue;
                const feature = localFeatures.find(f => f.id === feature_id);
                if (!feature) continue;
    
                // Delete feature
                await FeaturesController._delete_feature(feature_id, trx);
            }
    
            // Bulk update feature values
            for (const [feature_id, { create_values, update_values, delete_values_id }] of Object.entries(Allfeatures.values)) {
                for (const value of create_values||[]) {
                    const id = v4()
                    console.log({feature_id});
                    
                    console.log('1##############');
                    await ValuesController._create_value(request, { ...value, feature_id ,id}, id, trx);
                    console.log('2##############');
                }
                for (const value of update_values||[]) {
                    console.log('update_values',value);
                    
                    await ValuesController._update_value(request, value.id || value.value_id, value, trx);
                }
                for (const value_id of delete_values_id||[]) {
                    try {
                        await ValuesController._delete_value(value_id, trx);
                    } catch (error) {
                        console.log(error.message);
                    }
                } 
            }
    
            await trx.commit();
            console.log('3##############');
            const updatedProduct = await Product.query().select('*').preload('features', (featureQuery) => {
                featureQuery
                  .orderBy('features.created_at', 'asc') // 🔥 Trier les features par date de création
                  .preload('values', (valueQuery) => {
                    valueQuery.orderBy('values.created_at', 'asc') // 🔥 Trier les values par date de création
                  });
              })
                .where('id', product_id)
                .first();
                
            return response.ok(updatedProduct?.toObject());
        } catch (error) {
            console.log(error);
            
            await trx.rollback();
            return response.internalServerError({ message: 'Failed to update features', error: error.message });
        }
    }
    

    public static async _delete_feature(feature_id: string, trx: any) {
        const feature = await Feature.query({client:trx}).preload('values').where('id', feature_id).first();
        if (!feature) throw new Error('Feature not found');
        
        // Delete feature values first
        await Promise.allSettled(feature.values?.map(value => ValuesController._delete_value(value.id, trx)));
        
        await feature.useTransaction(trx).delete();
        await deleteFiles(feature_id);
    }
    async delete_feature({ request, response, auth }: HttpContext) {
        await auth.authenticate();
        // const payload = await DeleteFeatureValidator.validate({
        //     data: { id: request.param('id') },
        //     messages: DeleteFeatureMessage
        // });

        const payload = request.body();

        const trx = await db.transaction();
        try {
            FeaturesController._delete_feature(payload.feature_id, trx);
            await trx.commit();
            return response.ok({ message: 'Feature deleted successfully' });
        } catch (error) {
            await trx.rollback();
            return response.internalServerError({ message: 'Bad config or server error', error: error.message });
        }
    }

}