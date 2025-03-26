import Feature, { FeaturType } from '#models/feature';
import type { HttpContext } from '@adonisjs/core/http'
import { v4 } from 'uuid'
import { createFiles } from './Utils/FileManager/CreateFiles.js';
import { EXT_SUPPORTED, MEGA_OCTET } from './Utils/ctrlManager.js';
import Product from '#models/product';
import { updateFiles } from './Utils/FileManager/UpdateFiles.js';
import { deleteFiles } from './Utils/FileManager/DeleteFiles.js';
import db from '@adonisjs/lucid/services/db';
import { CreateFeatureMessage, CreateFeatureValidator, DeleteFeatureMessage, DeleteFeatureValidator, GetFeaturesMessage, GetFeaturesValidator, GetFeaturesWithValuesMessage, GetFeaturesWithValuesValidator, UpdateFeatureMessage, UpdateFeaturesValuesMessage, UpdateFeaturesValuesValidator, UpdateFeatureValidator } from '#validators/FeaturesValidator';
import ValuesController from './values_controller.js';

export interface ValueInterface {
    id?: string;
    feature_id?: string;
    views?: string | null;
    icon?: string | null;
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
    type?: string,
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

        const icon = await createFiles({
            request,
            column_name: "icon",
            table_id: feature.id,
            table_name: Feature.table,
            options: {
                throwError: false,
                compress: 'img',
                min: 0,
                max: 1,
                extname: EXT_SUPPORTED,
                maxSize: 1 * MEGA_OCTET,
            },
        });
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
            type: Object.values(FeaturType).includes((feature as any).type) ? feature.type as any : FeaturType.TEXT,
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
            if (payload.feature_id) query.where('feature_id', payload.feature_id);
            if (payload.product_id) query.where('product_id', payload.product_id);
            const valuesPaginate = await query.paginate(1, 50);
            return response.ok({ list: valuesPaginate.all(), meta: valuesPaginate.getMeta() });
        } catch (error) {
            return response.internalServerError({ message: 'Bad config or server error', error: error.message });
        }
    }

    async get_features_with_values({ request, response }: HttpContext) {
        // const payload = await GetFeaturesWithValuesValidator.validate({
        //     data: request.qs(),
        //     messages: GetFeaturesWithValuesMessage
        // });
        const payload = request.qs();
        console.log("🚀 ~ FeaturesController ~ get_features_with_values ~ payload:", payload)
        try {
            const query = Feature.query().preload('values');
            if (payload.feature_id) query.where('id', payload.feature_id);
            if (payload.product_id) query.where('product_id', payload.product_id);

            const features = await query;
            if (!features || features.length === 0) {
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

    async _update_feature(response: HttpContext['response'], request: HttpContext['request'], feature_id: string, feature: Partial<FeatureInterface>, trx: any) {
        const f = await Feature.findOrFail(feature_id, { client: trx });

        feature.min_size = parseInt(feature.min_size?.toString() || '0');
        feature.max_size = parseInt(feature.max_size?.toString() || '0');
        feature.max = parseInt(feature.max?.toString() || '0');
        feature.min = parseInt(feature.min?.toString() || '0');
        feature.index = parseInt(feature.index?.toString() || '1');


        // let urls = [];
        // for (const i of ['icon'] as const) {
        //     if (!feature[i]) continue;
        //     urls = await updateFiles({
        //         request,
        //         table_name: Feature.table,
        //         table_id: feature_id,
        //         column_name: i,
        //         lastUrls: f[i],
        //         newPseudoUrls: feature[i],
        //         options: {
        //             throwError: true,
        //             min: 1,
        //             max: 1,
        //             compress: 'img',
        //             extname: EXT_SUPPORTED,
        //             maxSize: 12 * MEGA_OCTET,
        //         },
        //     });
        //     f[i] = urls;
        // }
        f.useTransaction(trx).merge({
            name: feature.name?.replace(/\s+/g, ' ').substring(0, 56),
            default_value: feature.default_value?.substring(0, 52),
            type: Object.values(FeaturType).includes((feature as any).type) ? feature.type as any : FeaturType.TEXT,
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
        console.log('🔄 _update_feature save =>>', f.name, f.id);

        return f;
    }

    async update_feature({ request, response }: HttpContext) {
        // const payload = await UpdateFeatureValidator.validate({
        //     data: request.body(),
        //     messages: UpdateFeatureMessage
        // });

        const payload = request.body();
        const trx = await db.transaction();
        if (!payload.feature_id) return response.badRequest({ message: 'feature_id is required' });
        try {

            const feature = await this._update_feature(response, request, payload.feature_id, payload, trx);

            await trx.commit();
            return response.ok(feature);
        } catch (error) {
            // await deleteFiles(payload.feature_id);
            await trx.rollback();
            return response.internalServerError({ message: 'Bad config or server error', error: error.message });
        }
    }

    async muptiple_update_features_values({ request, response, auth }: HttpContext) {
        // await auth.authenticate();
        const payload = request.body() as { multiple_update_features?: string, product_id?: string };

        // const payload = await UpdateFeaturesValuesValidator.validate({
        //     data: request.body(),
        //     messages: UpdateFeaturesValuesMessage
        // });

        console.log('🔄 muptiple_update_features_values', payload);

        if (!payload.product_id || typeof payload.product_id !== 'string') {
            return response.badRequest({ message: 'product_id is required and must be a string' });
        }
        if (!payload.multiple_update_features || typeof payload.multiple_update_features !== 'string') {
            return response.badRequest({ message: 'multiple_update_features is required and must be a string' });
        }
        const trx = await db.transaction();
        try {

            type UpdateType = {
                values: Record<string, {
                    create_values: Partial<ValueInterface>[],
                    update_values: Partial<ValueInterface>[],
                    delete_values_id: string[],
                }>,
                create_features: FeatureInterface[],
                update_features: FeatureInterface[],
                delete_features_id: string[],
            }

            let features = JSON.parse(payload.multiple_update_features) as UpdateType
            // const values = JSON.parse(payload.values) as UpdateValue
            console.log(features);

            const product = await Product.findOrFail(payload.product_id, { client: trx });

            const localFeatures = await Feature.query({ client: trx }).preload('values').where('product_id', payload.product_id);

            for (const feature of features.update_features) {
                if (!feature.id) continue;
                if (feature.id == product.default_feature_id) continue;
                const f = localFeatures.find(f => f.id === feature.id);
                if (!f) {
                    console.log('🔄 le feature  not found ', { feature });
                    continue
                }

                console.log('🔄 update Fearture, Name', feature.name, feature.id);
                try {
                    await this._update_feature(response, request, feature.id, feature, trx);
                } catch (error) {
                    console.log('❌ update Feature', error);
                    // throw error;
                }
            }
            for (const feature of features.create_features) {
                console.log('🔄 Create Fearture, Name', feature.name, feature.id);
                const id = v4();
                feature.id = id;
                const values = feature.values;
                feature.product_id = payload.product_id
                delete feature.values;
                try {
                    await this._create_feature(request, product.id, feature as any, trx);
                    if (!values) continue;

                    for (let value of values) {
                        const _id = v4();
                        try {
                            value.feature_id = id;
                            await ValuesController._create_value(request, value, _id, trx)
                        } catch (error) {
                            console.log('❌ create Value', error);
                            await deleteFiles(_id);
                            // throw error;
                        }
                    }
                } catch (error) {
                    console.log('❌ Create Feature', error);
                    await deleteFiles(id);
                    // throw error;
                }
            }
            for (const feature_id of features.delete_features_id) {
                if (feature_id == product.default_feature_id) continue;
                const f = localFeatures.find(f => f.id === feature_id);
                if (!f) {
                    console.log('🔄 le feature  not found ', { feature_id });
                    continue
                }
                console.log('####### values dans la feautre a delete #######=>>>>>>>>>>', f.values);

                for (let value of f.values || []) {
                    try {
                        console.log('🔄 Delete Value, Name', value.id);
                        await ValuesController._delete_value(value.id, trx)

                    } catch (error) {
                        console.log('❌ Delete Value', error);
                        // throw error;
                    }
                }
                console.log('🔄 Delete Fearture, Name', feature_id);
                try {
                    await this._delete_feature(feature_id, trx);
                } catch (error) {
                    console.log('❌ delete Feature', error);
                    // throw error;
                }

            }
            // UPDATE VALUES dans les feature deja existant
            for (const key in features.values) {
                try {
                    const feature = await Feature.findOrFail(key, { client: trx });
                    if (!feature) continue;
                    if (feature.values) console.error('❌❌❌❌❌❌❌❌❌❌❌ feature.values', feature.values);
                    const values = features.values[key];
                    if (!values) continue;
                    for (const value of values.create_values) {
                        const _id = v4();
                        value.feature_id = key;
                        try {
                            await ValuesController._create_value(request, value, _id, trx);
                        } catch (error) {
                            console.error('❌ create Value', error);
                            // throw error;
                        }
                    }
                    for (const value of values.update_values) {
                        try {
                            console.log('#########################',value);
                            
                            await ValuesController._update_value(request,value.id||(value as any).value_id, value, trx);
                        } catch (error) {
                            console.error('❌ update Value', error);
                            // throw error;
                        }
                    }
                    for (const value_id of values.delete_values_id) {
                        try {
                            await ValuesController._delete_value(value_id, trx);
                        } catch (error) {
                            console.error('❌ delete Value', error);
                            // throw error;
                        }
                    }
                } catch (error) {

                }
            }

            await trx.commit();

            const p = await Product.query().select('*').where('id', payload.product_id).preload('features', (featureQuery) => {
                featureQuery.preload('values')
            }).first();
            return response.ok(p);
        } catch (error) {
            await trx.rollback();
            return response.internalServerError({ message: 'Bad config or server error', error: error.message });
        }
    }


    async _delete_feature(feature_id: string, trx: any) {
        const feature = await Feature.findOrFail(feature_id, { client: trx });
        // if (!feature) return response.notFound({ message: 'Feature not found' });
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
            this._delete_feature(payload.feature_id, trx);
            await trx.commit();
            return response.ok({ message: 'Feature deleted successfully' });
        } catch (error) {
            await trx.rollback();
            return response.internalServerError({ message: 'Bad config or server error', error: error.message });
        }
    }

     async get_group_bind_has({request, response}:HttpContext){

        const {bind, product_id} = request.qs();

        
        
    }
}