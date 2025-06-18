import type { HttpContext } from '@adonisjs/core/http'
import Product from '#models/product'
import ProductCharacteristic from '#models/product_characteristic'
import { v4 as uuidv4 } from 'uuid'
import db from '@adonisjs/lucid/services/db'
import vine from '@vinejs/vine'
import { Infer } from '@vinejs/vine/types'
import logger from '@adonisjs/core/services/logger'
import { normalizeStringArrayInput, t } from '../utils/functions.js'
import { TypeJsonRole } from '#models/role'
import { deleteFiles } from './Utils/media/DeleteFiles.js'
import { createFiles } from './Utils/media/CreateFiles.js'
import { EXT_IMAGE, MEGA_OCTET } from './Utils/ctrlManager.js'
import { updateFiles } from './Utils/media/UpdateFiles.js'
import { securityService } from '#services/SecurityService'

const EDIT_PERMISSION: keyof TypeJsonRole = 'edit_product';
const CREATE_DELETE_PERMISSION: keyof TypeJsonRole = 'create_delete_product';

export default class ProductCharacteristicsController {

    private createCharacteristicSchema = vine.compile(
        vine.object({
            product_id: vine.string().uuid(),
            name: vine.string().trim().minLength(1).maxLength(255),
            icon: vine.any().optional().nullable(),
            description: vine.string().trim().maxLength(1000).optional().nullable(),
            key: vine.string().trim().maxLength(100).optional().nullable(),
            value_text: vine.string().trim().maxLength(512).optional().nullable(),
            quantity: vine.number().optional().nullable(),
            unity: vine.string().trim().maxLength(52).optional().nullable(),
            level: vine.number().min(0).optional().nullable(),
            index: vine.number().min(0).optional(),
        })
    );

    private updateCharacteristicSchema = vine.compile(
        vine.object({
            name: vine.string().trim().minLength(1).maxLength(255).optional(),
            icon: vine.any().optional().nullable(),
            description: vine.string().trim().maxLength(1000).optional().nullable(),
            key: vine.string().trim().maxLength(100).optional().nullable(),
            value_text: vine.string().trim().maxLength(512).optional().nullable(),
            quantity: vine.number().optional().nullable(),
            unity: vine.string().trim().maxLength(52).optional().nullable(),
            level: vine.number().min(0).optional().nullable(),
            index: vine.number().min(0).optional(),
        })
    );

    private listCharacteristicsSchema = vine.compile(
        vine.object({
            product_id: vine.string().uuid(),
            key: vine.string().trim().maxLength(100).optional(),
            page: vine.number().min(1).optional(),
            limit: vine.number().min(1).max(100).optional(),
        })
    );

    private characteristicIdParamsSchema = vine.compile(
        vine.object({
            characteristicId: vine.string().uuid(),
        })
    );

    /**
     * @createCharacteristic
     * Create a new characteristic for a product.
     */
    async createCharacteristic({ request, response, auth }: HttpContext) {
        const user =  await securityService.authenticate({ request, auth });
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [EDIT_PERMISSION]);
        } catch (error) {
            return response.forbidden({ message: t('unauthorized_action') });
        }

        let payload: Infer<typeof this.createCharacteristicSchema>;
        try {
            payload = await this.createCharacteristicSchema.validate(request.body());
        } catch (error) {
            logger.warn({ validationErrors: error.messages, body: request.body() }, 'ProductCharacteristic creation validation failed');
            return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
        }

        const trx = await db.transaction();
        const characteristic_id = uuidv4()
        try {
            const product = await Product.find(payload.product_id, { client: trx });
            if (!product) {
                await trx.rollback();
                return response.notFound({ message: t('product.notFound') });
            }

            const iconUrls = await createFiles({
                request, column_name: "icon", table_id: characteristic_id, table_name: ProductCharacteristic.table,
                options: { compress: 'img', min: 0, max: 1, maxSize: 12 * MEGA_OCTET, extname: EXT_IMAGE, throwError: true }, // Rendre icon requis (min: 1)
            });

            const maxIndexResult = await ProductCharacteristic.query({ client: trx })
                .where('product_id', payload.product_id)
                .max('index as maxIdx')
                .first();

            const newIndex = payload.index ?? (maxIndexResult?.$extras.maxIdx !== null ? (maxIndexResult?.$extras.maxIdx || 0) + 1 : 0);

            const characteristic = await ProductCharacteristic.create({
                id: characteristic_id,
                product_id: payload.product_id,
                name: payload.name,
                icon: iconUrls,
                description: payload.description || null,
                key: payload.key || null,
                value_text: payload.value_text || null,
                quantity: payload.quantity, // Garde null si non fourni
                unity: payload.unity || null,
                level: payload.level,
                index: newIndex,
            }, { client: trx });

            await trx.commit();
            logger.info({ userId: user.id, characteristicId: characteristic.id, productId: product.id }, 'ProductCharacteristic created');
            return response.created({ message: t('productCharacteristic.createdSuccess'), characteristic });
        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user.id, productId: payload.product_id, error: error.message }, 'Failed to create ProductCharacteristic');
            return response.internalServerError({ message: t('productCharacteristic.creationFailed'), error: error.message });
        }
    }

    /**
     * @listCharacteristics
     * List characteristics for a specific product.
     * Publicly accessible.
     */
    async listCharacteristics({ request, response }: HttpContext) {
        let payload: Infer<typeof this.listCharacteristicsSchema>;
        try {
            payload = await this.listCharacteristicsSchema.validate(request.qs());
        } catch (error) {
            logger.warn({ validationErrors: error.messages, query: request.qs() }, 'ProductCharacteristic list validation failed');
            return response.badRequest({ message: t('validationFailed'), errors: error.messages });
        }

        try {
            const product = await Product.find(payload.product_id);
            if (!product /* || !product.is_visible */) {
                return response.notFound({ message: t('product.notFound') });
            }

            const query = ProductCharacteristic.query().where('product_id', payload.product_id);

            if (payload.key) {
                query.where('key', payload.key);
            }

            query.orderBy('level', 'asc').orderBy('index', 'asc'); // Trier par niveau puis par index

            const page = payload.page || 1;
            const limit = payload.limit || 50; // Peut y en avoir beaucoup
            const characteristics = await query.paginate(page, limit);

            return response.ok({
                list:characteristics.all(),
                meta:characteristics.getMeta()
            });
        } catch (error) {
            logger.error({ productId: payload.product_id, error: error.message }, 'Failed to list ProductCharacteristics');
            return response.internalServerError({ message: t('productCharacteristic.fetchFailed'), error: error.message });
        }
    }

    /**
     * @getCharacteristic
     * Get a specific characteristic by its ID.
     */
    async getCharacteristic({ params: routeParams, response }: HttpContext) {
        let validatedParams: Infer<typeof this.characteristicIdParamsSchema>;
        try {
            validatedParams = await this.characteristicIdParamsSchema.validate(routeParams);
        } catch (error) {
            return response.badRequest({ message: t('validationFailed'), errors: error.messages });
        }

        try {
            const characteristic = await ProductCharacteristic.find(validatedParams.characteristicId);
            if (!characteristic) {
                return response.notFound({ message: t('productCharacteristic.notFound') });
            }
            // Pourrait précharger et vérifier la visibilité du produit parent ici
            return response.ok(characteristic);
        } catch (error) {
            logger.error({ characteristicId: validatedParams.characteristicId, error: error.message }, 'Failed to get ProductCharacteristic');
            return response.internalServerError({ message: t('productCharacteristic.fetchOneFailed'), error: error.message });
        }
    }

    /**
     * @updateCharacteristic
     * Update an existing characteristic.
     */
    async updateCharacteristic({ params: routeParams, request, response, auth }: HttpContext) {
        const user =  await securityService.authenticate({ request, auth });
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [EDIT_PERMISSION]);
        } catch (error) {
            return response.forbidden({ message: t('unauthorized_action') });
        }

        let validatedParams: Infer<typeof this.characteristicIdParamsSchema>;
        let payload: Infer<typeof this.updateCharacteristicSchema>;
        try {
            validatedParams = await this.characteristicIdParamsSchema.validate(routeParams);
            payload = await this.updateCharacteristicSchema.validate(request.body());
        } catch (error) {
            logger.warn({ validationErrors: error.messages, body: request.body(), params: routeParams }, 'ProductCharacteristic update validation failed');
            return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
        }

        const trx = await db.transaction();
        try {
            const characteristic = await ProductCharacteristic.find(validatedParams.characteristicId, { client: trx });
            if (!characteristic) {
                await trx.rollback();
                return response.notFound({ message: t('productCharacteristic.notFound') });
            }

            for (const f of [ 'icon'] as const) {
                if (payload[f] !== undefined) { 
                    let normalizedUrls: string[] = [];
                    try {
                        normalizedUrls = normalizeStringArrayInput({ [f]: payload[f] })[f];
                    } catch (error) {
                        // 🌍 i18n
                        await trx.rollback();
                        return response.badRequest({ message: t('invalid_value', { key: f, value: payload[f] }) });
                    }

                    if (normalizedUrls !== undefined) { // Vérifier après normalisation
                        const updatedUrls = await updateFiles({
                            request, table_name: ProductCharacteristic.table, table_id: characteristic.id, column_name: f,
                            lastUrls: characteristic[f] || [], newPseudoUrls: normalizedUrls,
                            options: {
                                throwError: true, min: 1, max: 1, compress: 'img',
                                extname: EXT_IMAGE, maxSize: 12 * MEGA_OCTET,
                            },
                        });
                        payload[f] = updatedUrls;
                    }
                }
            }

            characteristic.merge({
                ...payload
            });
            await characteristic.save();
            await trx.commit();
            logger.info({ userId: user.id, characteristicId: characteristic.id }, 'ProductCharacteristic updated');
            return response.ok({ message: t('productCharacteristic.updateSuccess'), characteristic });
        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user.id, characteristicId: validatedParams.characteristicId, error: error.message }, 'Failed to update ProductCharacteristic');
            return response.internalServerError({ message: t('productCharacteristic.updateFailed'), error: error.message });
        }
    }

    /**
     * @deleteCharacteristic
     * Delete a characteristic.
     */
    async deleteCharacteristic({ params: routeParams, response, request, auth }: HttpContext) {
         const user =  await securityService.authenticate({ request, auth });
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [CREATE_DELETE_PERMISSION]);
        } catch (error) {
            return response.forbidden({ message: t('unauthorized_action') });
        }

        let validatedParams: Infer<typeof this.characteristicIdParamsSchema>;
        try {
            validatedParams = await this.characteristicIdParamsSchema.validate(routeParams);
        } catch (error) {
            return response.badRequest({ message: t('validationFailed'), errors: error.messages });
        }

        const trx = await db.transaction();
        try {
            const characteristic = await ProductCharacteristic.find(validatedParams.characteristicId, { client: trx });
            if (!characteristic) {
                await trx.rollback();
                return response.notFound({ message: t('productCharacteristic.notFound') });
            }

            await characteristic.delete();
            await deleteFiles(characteristic.id)
            await trx.commit();
            // Potentielle réindexation ici si nécessaire
            logger.info({ userId: user.id, characteristicId: validatedParams.characteristicId }, 'ProductCharacteristic deleted');
            return response.ok({ message: t('productCharacteristic.deleteSuccess'), isDeleted: true });
        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user.id, characteristicId: validatedParams.characteristicId, error: error.message }, 'Failed to delete ProductCharacteristic');
            return response.internalServerError({ message: t('productCharacteristic.deleteFailed'), error: error.message });
        }
    }
}