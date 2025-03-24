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
        // const icon = await createFiles({
        //     request,
        //     column_name: "icon",
        //     table_id: feature.id,
        //     table_name: Feature.table,
        //     options: {
        //         throwError: true,
        //         compress: 'img',
        //         min: 0,
        //         max: 1,
        //         extname: EXT_SUPPORTED,
        //         maxSize: 1 * MEGA_OCTET,
        //     },
        // });


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
        // if (!f) return response.notFound({ message: 'Feature not found' });

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
            type UpdateValue = {
                create_values: ValueInterface[],
                update_values: ValueInterface[],
                delete_values: string[],
            }
            type UpdateFeature = {
                create_features: FeatureInterface[],
                update_features: FeatureInterface[],
                delete_features: string[],
            }

            let features = JSON.parse(payload.multiple_update_features) as UpdateFeature
            // const values = JSON.parse(payload.values) as UpdateValue
            console.log({
                features
            });

            const product = await Product.findOrFail(payload.product_id, { client: trx });

            const createdFeatures: Feature['$attributes'][] = [];
            const deletedFeatures: string[] = [];
            const updatedFeatures: Feature['$attributes'][] = [];

            const localFeatures = await Feature.query({ client: trx }).preload('values').where('product_id', payload.product_id);

            for (const feature of features.update_features) {
                if (!feature.id) return;
                if (feature.id == product.default_feature_id) return;
                const f = localFeatures.find(f => f.id === feature.id);
                if (!f) return console.log('🔄 le feature  not found ', { feature });

                console.log('🔄 update ====>>', { feature });

                updatedFeatures.push(
                    await this._update_feature(response, request, feature.id, feature, trx)
                );
            }

            for (const feature of features.create_features) {
                const id = v4();
                const f = { ...feature, id }
                const values = f.values;
                f.product_id = payload.product_id
                delete f.values;
                try {
                    const _f = await this._create_feature(request, product.id, f, trx);
                    createdFeatures.push(_f.toJSON());
                    if (!values) return;
                    const v: any[] = []
                    for (let value of values) {
                        try {
                            value.feature_id = _f.id;
                            const _id = v4();
                            v.push(
                                await ValuesController._create_value(request, value, _id, trx)
                            );
                        } catch (error) {
                            console.log('❌ create Value', error);
                            await deleteFiles(id);
                            throw error;
                        }
                    }
                } catch (error) {
                    console.log('❌ update Feature', error);
                    await deleteFiles(id);
                    throw error;
                }
            }
            for (const feature of features.delete_features) {
                console.log('🔄 delete ====>>', { feature });
                deletedFeatures.push(feature);
                if (feature == product.default_feature_id) return;
                // const f = localFeatures.find(f => f.id === feature);
                try {
                    await this._delete_feature(feature, trx);
                } catch (error) {
                    console.log('❌ delete Feature', error);
                    throw error;
                }

            }

            console.log(' 🧐 await trx.commit ', trx.isCompleted);
            await trx.commit();
            console.log(' 🧐 await trx.commit ', trx.isCompleted);

            return response.ok({
                createdFeatures,
                deletedFeatures,
                updatedFeatures,
            });
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
}