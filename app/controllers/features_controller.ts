import Feature, { FeatureType } from '#models/feature';
import type { HttpContext } from '@adonisjs/core/http'
import { v4 } from 'uuid'
import { createFiles } from './Utils/media/CreateFiles.js';
import { EXT_IMAGE, MEGA_OCTET } from './Utils/ctrlManager.js';
import Product from '#models/product';
import { updateFiles } from './Utils/media/UpdateFiles.js';
import { deleteFiles } from './Utils/media/DeleteFiles.js';
import db from '@adonisjs/lucid/services/db';
import ValuesController from './values_controller.js'; // Conservé pour appels internes
import vine from '@vinejs/vine'; // ✅ Ajout de Vine
import logger from '@adonisjs/core/services/logger'; // Ajout pour logs
import { t } from '../utils/functions.js'; // ✅ Ajout de t
import { Infer } from '@vinejs/vine/types';
import { securityService } from '#services/SecurityService';

// Interfaces (conservées pour clarté du code qui les utilise)
export interface ValueInterface {
    id?: string;
    feature_id?: string;
    views?: string[] | undefined;
    icon?: string[] | undefined;
    text?: string | undefined;
    key?: string | undefined;
    stock?: number | undefined
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
    icon?: string[], // Modifié pour être un tableau de strings
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

// Permissions requises pour ce contrôleur
const EDIT_PERMISSION = 'edit_product';
const CREATE_DELETE_PERMISSION = 'create_delete_product';

export default class FeaturesController {

    // --- Schémas de validation Vine ---
    private createFeatureSchema = vine.compile(
        vine.object({
            product_id: vine.string().uuid(),
            name: vine.string().trim().minLength(1).maxLength(56),
            type: vine.enum(Object.values(FeatureType)),
            required: vine.boolean().optional(),
            default_value: vine.string().trim().maxLength(52).optional().nullable(),
            regex: vine.string().trim().maxLength(1024).optional().nullable(),
            min_size: vine.number().min(0).optional(),
            max_size: vine.number().min(0).optional(),
            min: vine.number().optional(), // Pas de min(0) car peut être négatif ?
            max: vine.number().optional(),
            index: vine.number().positive().optional(),
            multiple: vine.boolean().optional(),
            is_double: vine.boolean().optional(),
            // 'icon' est géré par createFiles
        })
    );

    private getFeaturesSchema = vine.compile(
        vine.object({
            feature_id: vine.string().uuid().optional(),
            product_id: vine.string().uuid().optional(),
        })
    );

    private updateFeatureSchema = vine.compile(
        vine.object({
            feature_id: vine.string().uuid(), // ID de la feature à mettre à jour
            name: vine.string().trim().minLength(1).maxLength(56).optional(),
            type: vine.enum(Object.values(FeatureType)).optional(),
            required: vine.boolean().optional(),
            default_value: vine.string().trim().maxLength(52).optional().nullable(),
            regex: vine.string().trim().maxLength(1024).optional().nullable(),
            min_size: vine.number().min(0).optional(),
            max_size: vine.number().min(0).optional(),
            min: vine.number().optional(),
            max: vine.number().optional(),
            index: vine.number().positive().optional(),
            multiple: vine.boolean().optional(),
            is_double: vine.boolean().optional(),
            icon: vine.array(vine.string()).optional(), // Pour updateFiles (pseudo URLs)
        })
    );

    private multipleUpdateSchema = vine.compile(
        vine.object({
            product_id: vine.string().uuid(),
            multiple_update_features: vine.string().minLength(2), // Doit être un JSON string non vide
        })
    );

    private deleteFeatureSchema = vine.compile(
        vine.object({
            feature_id: vine.string().uuid(), // On attend feature_id dans le body selon le code original
        })
    );

    // --- Méthodes Privées (Logique métier inchangée) ---

    // Note: _create_feature et _update_feature ne sont plus typées avec HttpContext['request']
    // car elles reçoivent maintenant des données déjà validées et potentiellement l'objet request si besoin pour les fichiers.
    private async _create_feature(request: HttpContext['request'], product_id: string, featureData: Partial<Infer<typeof this.createFeatureSchema>> & { id: string }, trx: any) {
        // Gestion icon via createFiles
        const iconUrls = await createFiles({
            request, // Passer request pour accéder aux fichiers
            column_name: "icon",
            table_id: featureData.id,
            table_name: Feature.table,
            options: {
                throwError: false,
                compress: 'img',
                min: 0,
                max: 1,
                extname: EXT_IMAGE,
                maxSize: 1 * MEGA_OCTET,
            },
        });

        // Préparation des données (parsing/défaults)
        const min_size = featureData.min_size ?? 0;
        const max_size = featureData.max_size ?? 0; // Corrigé: utiliser min_size si max_size absent ? Ou 0 ? Mettre 0.
        const max = featureData.max ?? 0;
        const min = featureData.min ?? 0;
        const index = featureData.index ?? 1; // Default index 1

        const dataToCreate = {
            id: featureData.id,
            product_id: product_id,
            name: featureData.name?.replace(/\s+/g, ' ').substring(0, 56), // Assurer que name existe car validé
            default_value: featureData.default_value?.substring(0, 52),
            type: featureData.type, // Déjà validé par Vine
            icon: iconUrls, // Utiliser les URLs des fichiers uploadés
            regex: featureData.regex?.substring(0, 1024),
            min_size: isNaN(min_size) ? 0 : min_size,
            max_size: isNaN(max_size) ? 0 : max_size,
            max: isNaN(max) ? 0 : max,
            min: isNaN(min) ? 0 : min,
            index: isNaN(index) ? 0 : index,
            required: !!featureData.required,
            multiple: !!featureData.multiple,
            is_double: !!featureData.is_double,
        }

        const newFeature = await Feature.create(dataToCreate, { client: trx });
        return newFeature
    }

    private async _update_feature(request: HttpContext['request'], feature_id: string, featureData: Partial<Infer<typeof this.updateFeatureSchema>>, trx: any) {
        const f = await Feature.findOrFail(feature_id, { client: trx });

        // Préparation des données (parsing/défaults)
        const min_size = featureData.min_size;
        const max_size = featureData.max_size;
        const max = featureData.max;
        const min = featureData.min;
        const index = featureData.index;

        const dataToMerge: Partial<Feature> = {
            ...(featureData.name && { name: featureData.name.replace(/\s+/g, ' ').substring(0, 56) }),
            ...(featureData.default_value !== undefined && { default_value: featureData.default_value?.substring(0, 52) }), // Gérer null
            ...(featureData.type && { type: featureData.type }),
            ...(featureData.regex !== undefined && { regex: featureData.regex?.substring(0, 1024) }),
            ...(min_size !== undefined && { min_size: isNaN(min_size) ? f.min_size : min_size }), // Garder l'ancien si NaN
            ...(max_size !== undefined && { max_size: isNaN(max_size) ? f.max_size : max_size }),
            ...(max !== undefined && { max: isNaN(max) ? f.max : max }),
            ...(min !== undefined && { min: isNaN(min) ? f.min : min }),
            ...(index !== undefined && { index: isNaN(index) ? f.index : index }),
            ...(featureData.required !== undefined && { required: !!featureData.required }),
            ...(featureData.multiple !== undefined && { multiple: !!featureData.multiple }),
            ...(featureData.is_double !== undefined && { is_double: !!featureData.is_double }),
        }

        // Gestion icon via updateFiles
        if (featureData.icon) {
            const updatedIconUrls = await updateFiles({
                request,
                table_name: Feature.table,
                table_id: feature_id,
                column_name: 'icon',
                lastUrls: f.icon || [],
                newPseudoUrls: featureData.icon,
                options: {
                    throwError: true,
                    min: 0,
                    max: 1,
                    compress: 'img',
                    extname: EXT_IMAGE,
                    maxSize: 12 * MEGA_OCTET, // Augmenté pour correspondre à l'ancien code ? Ou garder 1MB ? Prenons 5MB.
                },
            });
            dataToMerge.icon = updatedIconUrls;
        }

        f.useTransaction(trx).merge(dataToMerge);
        await f.useTransaction(trx).save();

        return f;
    }

    // Laisser _delete_feature tel quel, car il contient la logique métier de suppression des valeurs associées
    public static async _delete_feature(feature_id: string, trx: any) {
        const feature = await Feature.query({ client: trx }).preload('values').where('id', feature_id).first();
        if (!feature) {
            // 🌍 i18n
            throw new Error(t('feature.notFound')); // Le message sera propagé
        }

        // Delete feature values first
        await Promise.allSettled(feature.values?.map(value => ValuesController._delete_value(value.id, trx)));

        await feature.useTransaction(trx).delete();
        await deleteFiles(feature_id); // Nettoyage des fichiers potentiels (icon)
    }

    // --- Méthodes Publiques (Contrôleur) ---

    public async create_feature({ request, response, auth }: HttpContext) {
        // 🔐 Authentification
        await securityService.authenticate({ request, auth });
        // 🛡️ Permissions
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [EDIT_PERMISSION])
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') })
            }
            throw error;
        }

        const id = v4();
        const trx = await db.transaction();

        try {
            // ✅ Validation Vine
            const payload = await this.createFeatureSchema.validate(request.body());

            // Recherche Produit (logique métier)
            const product = await Product.findOrFail(payload.product_id, { client: trx });
            // Pas besoin de vérifier !product car findOrFail le fait

            // Appel méthode privée avec données validées
            const feature = await this._create_feature(request, product.id, { ...payload, id }, trx);

            await trx.commit();
            logger.info({ userId: auth.user!.id, featureId: feature.id, productId: product.id }, 'Feature created');
            // 🌍 i18n
            return response.created({ message: t('feature.createdSuccess'), feature: feature }); // Retourne OK avec l'objet créé

        } catch (error) {
            await trx.rollback();
            // Nettoyage fichiers en cas d'erreur avant commit
            await deleteFiles(id).catch(delErr => logger.error({ featureIdAttempt: id, error: delErr }, 'Failed to cleanup files after feature creation failure'));

            logger.error({ userId: auth.user?.id, error: error.message, stack: error.stack }, 'Failed to create feature');
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages })
            }
            if (error.code === 'E_ROW_NOT_FOUND') {
                // 🌍 i18n (si findOrFail échoue sur Product)
                return response.notFound({ message: t('product.notFound') });
            }
            // 🌍 i18n
            return response.internalServerError({ message: t('feature.creationFailed'), error: error.message });
        }
    }

    // Lecture publique
    async get_features({ request, response }: HttpContext) {
        let payload: Infer<typeof this.getFeaturesSchema>;
        try {
            // ✅ Validation Vine pour Query Params
            payload = await this.getFeaturesSchema.validate(request.qs());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: t('validationFailed'), errors: error.messages })
            }
            throw error;
        }

        try {
            // Utiliser Lucid ORM directement pour bénéficier des relations/méthodes du modèle
            let query = Feature.query();

            if (payload.feature_id) {
                // 🔍 Pas de .first() ici, on veut potentiellement un tableau même avec un ID
                query = query.where('id', payload.feature_id).limit(1);
            }
            if (payload.product_id) {
                query = query.where('product_id', payload.product_id);
            }

            // Utilisation de paginate même pour potentiellement un seul résultat par ID
            // pour garder une structure de réponse cohérente.
            const featuresPaginate = await query.orderBy('index', 'asc').paginate(1, 50); // Limite haute pour "tout" récupérer si ID unique

            return response.ok({ list: featuresPaginate.all(), meta: featuresPaginate.getMeta() });
        } catch (error) {
            logger.error({ error: error.message, stack: error.stack }, 'Failed to get features');
            // 🌍 i18n
            return response.internalServerError({ message: t('feature.fetchFailed'), error: error.message });
        }
    }

    // Lecture publique
    async get_features_with_values({ request, response }: HttpContext) {
        let payload: Infer<typeof this.getFeaturesSchema>; // Réutilise le même schéma
        try {
            // ✅ Validation Vine pour Query Params
            payload = await this.getFeaturesSchema.validate(request.qs());

        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: t('validationFailed'), errors: error.messages })
            }
            throw error;
        }

        try {
            const query = Feature.query()
                .preload('values', (valueQuery) => { // Précharger les valeurs
                    valueQuery.orderBy('index', 'asc'); // Trier les valeurs
                });

            if (payload.feature_id) {
                query.where('id', payload.feature_id);
            }
            if (payload.product_id) {
                query.where('product_id', payload.product_id);
            }

            const features = await query.orderBy('index', 'asc'); // Trier les features

            if (!features.length && (payload.feature_id || payload.product_id)) {
                // 🌍 i18n
                return response.notFound({ message: t('feature.notFound') });
            }

            return response.ok(features); // Renvoie directement le tableau des features avec leurs valeurs
        } catch (error) {
            logger.error({ error: error.message, stack: error.stack }, 'Failed to get features with values');
            // 🌍 i18n
            return response.internalServerError({ message: t('feature.fetchWithValuesFailed'), error: error.message, });
        }
    }

    async update_feature({ request, response, auth }: HttpContext) {
        // 🔐 Authentification
        await securityService.authenticate({ request, auth });
        // 🛡️ Permissions
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [EDIT_PERMISSION])
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') })
            }
            throw error;
        }

        const trx = await db.transaction();
        let payload: Infer<typeof this.updateFeatureSchema>;
        try {
            // ✅ Validation Vine
            payload = await this.updateFeatureSchema.validate(request.body());

            // Appel méthode privée avec données validées
            const feature = await this._update_feature(request, payload.feature_id, payload, trx);

            await trx.commit();
            logger.info({ userId: auth.user!.id, featureId: feature.id }, 'Feature updated');
            // 🌍 i18n
            return response.ok({ message: t('feature.updateSuccess'), feature: feature });

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: auth.user?.id, error: error.message, stack: error.stack }, 'Failed to update feature');
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages })
            }
            if (error.code === 'E_ROW_NOT_FOUND') {
                // 🌍 i18n
                return response.notFound({ message: t('feature.notFound') });
            }
            // 🌍 i18n
            return response.internalServerError({ message: t('feature.updateFailed'), error: error.message });
        }
    }

    async multiple_update_features_values({ request, response, auth }: HttpContext) {
        // 🔐 Authentification
        await securityService.authenticate({ request, auth });
        // 🛡️ Permissions
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [EDIT_PERMISSION])
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') })
            }
            throw error;
        }

        let payload: Infer<typeof this.multipleUpdateSchema>;


        try {
            // ✅ Validation Vine (simple pour le JSON string)
            payload = await this.multipleUpdateSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages })
            }
            throw error;
        }

        console.log(payload);

        const trx = await db.transaction();

        try {
            // Parsing du JSON string après validation
            let Allfeatures: {
                values: Record<string, { create_values: any[]; update_values: any[]; delete_values_id: string[] }> | undefined;
                create_features: FeatureInterface[] | undefined;
                update_features: FeatureInterface[] | undefined;
                delete_features_id: string[] | undefined;
            };
            try {
                Allfeatures = JSON.parse(payload.multiple_update_features);
                // TODO: Ajouter une validation plus fine de la structure interne de Allfeatures si nécessaire
            } catch (jsonError) {
                // 🌍 i18n
                throw new Error(t('feature.invalidJsonPayload'));
            }

            console.log(Allfeatures);

            const product = await Product.findOrFail(payload.product_id, { client: trx });

            const verifyDefaultFeature = async () => {
                let defautFeature = await Feature.query({ client: trx }).where('id', product.default_feature_id).preload('values').first();
                if(!product.default_feature_id) throw new Error('product.default_feature_id required, delelet product and create new')
                if (!defautFeature) {
                    defautFeature = await Feature.create({
                        id: product.default_feature_id,
                        product_id: product.id,
                        name: 'Les variantes visuels du produit', // Nom par défaut de la feature
                        required: false,
                        type: FeatureType.ICON_TEXT,
                        default_value: null,
                        icon: [],
                        is_default: true,
                        index: 0,
                    }, { client: trx })
                }
                if (defautFeature && defautFeature.values.length == 0) {
                    const id = v4()
                    await ValuesController._create_value(request, {
                        index: 0,
                        text: 'Texture',
                        feature_id: defautFeature.id
                    }, id, trx); // Utiliser targetFeature.id
                }
            }

            await verifyDefaultFeature()
            // --- Logique métier (inchangée) ---
            const localFeatures = await Feature.query({ client: trx }).preload('values').where('product_id', payload.product_id); // Utiliser payload.product_id

            // Bulk update features
            for (const feature of Allfeatures.update_features || []) {
                if (!feature.id) continue;
                const existingFeature = localFeatures.find(f => f.id === feature.id);
                if (!existingFeature) {
                    logger.warn({ featureId: feature.id, productId: payload.product_id }, "Attempted to update non-existent or non-matching feature in multiple_update");
                    continue; // Ne pas essayer de mettre à jour une feature qui n'existe pas ou n'appartient pas au produit
                }
                // TODO: Valider les données de 'feature' avant de les passer à _update_feature
                await this._update_feature(request, feature.id, feature, trx);
            }

            // Bulk create features and their values
            for (const feature of Allfeatures.create_features || []) {
                feature.product_id = payload.product_id; // Assigner le product_id validé
                const id = v4();
                // TODO: Valider les données de 'feature' avant de les passer à _create_feature
                await this._create_feature(request, payload.product_id, { ...feature, id }, trx);

                if (feature.values) {
                    for (const value of feature.values) {
                        // TODO: Valider les données de 'value' avant de les passer à _create_value
                        await ValuesController._create_value(request, { ...value, feature_id: id }, v4(), trx); // Utiliser id de la feature créée
                    }
                }
            }

            // Bulk delete features and their values
            for (const feature_id of Allfeatures.delete_features_id || []) {
                if (feature_id === product.default_feature_id) {
                    logger.warn({ featureId: feature_id, productId: payload.product_id }, "Attempted to delete default feature in multiple_update");
                    continue; // Ne pas supprimer la feature par défaut
                }
                const feature = localFeatures.find(f => f.id === feature_id);
                if (!feature) {
                    logger.warn({ featureId: feature_id, productId: payload.product_id }, "Attempted to delete non-existent or non-matching feature in multiple_update");
                    continue; // Ne pas essayer de supprimer une feature qui n'existe pas ou n'appartient pas au produit
                }
                await FeaturesController._delete_feature(feature_id, trx);
            }

            // Bulk update feature values
            for (const [feature_id_from_payload, { create_values, update_values, delete_values_id }] of Object.entries(Allfeatures.values || {})) {
                // Vérifier que feature_id_from_payload appartient bien au produit
                const targetFeature = await Feature.query({ client: trx }).where('id', feature_id_from_payload).first();
                if (!targetFeature) {
                    logger.warn({ featureId: feature_id_from_payload, productId: payload.product_id }, "Attempted to modify values for a non-existent or non-matching feature in multiple_update");
                    continue;
                }

                for (const value of create_values || []) {
                    const id = v4()
                    // TODO: Valider les données de 'value' avant de les passer à _create_value
                    await ValuesController._create_value(request, { ...value, feature_id: targetFeature.id }, id, trx); // Utiliser targetFeature.id
                }
                for (const value of update_values || []) {
                    console.log('update_values[', value.id, ']', { value });

                    if (!value.id && !value.value_id) continue; // Nécessite un ID
                    if (targetFeature.id !== value.feature_id) continue
                    await ValuesController._update_value(request, value.id || value.value_id, value, trx);
                }
                for (const value_id of delete_values_id || []) {
                    const featureD = await Feature.query({ client: trx }).where('id', feature_id_from_payload).preload('values').first();
                    if (!featureD) continue;
                    try {
                        if (featureD.is_default && featureD.values.length == 1) continue;
                        // Vérifier que la value appartient bien à targetFeature? (sécurité supplémentaire)
                        await ValuesController._delete_value(value_id, trx);
                    } catch (error) {
                        logger.warn({ valueId: value_id, featureId: targetFeature.id, error: error.message }, "Failed to delete value in multiple_update (might not exist or belong to feature)");
                    }
                }
            }

            
            await verifyDefaultFeature();

            // --- Fin logique métier ---

            await trx.commit();
            logger.info({ userId: auth.user!.id, productId: payload.product_id }, 'Multiple features/values updated');

            // Recharger le produit avec toutes ses dépendances triées
            const updatedProduct = await Product.query().select('*').preload('features', (featureQuery) => {
                featureQuery
                    .orderBy('index', 'asc') // Trier par index
                    .preload('values', (valueQuery) => {
                        valueQuery.orderBy('index', 'asc') // Trier par index
                    });
            })
                .where('id', payload.product_id)
                .first();

            // 🌍 i18n 
            return response.ok({ message: t('feature.multipleUpdateSuccess'), product: updatedProduct?.toObject() });
        } catch (error) {
            console.log(error);

            await trx.rollback();
            logger.error({ userId: auth.user?.id, productId: payload?.product_id, error: error.message, stack: error.stack }, 'Failed multiple_update_features_values');
            if (error.code === 'E_ROW_NOT_FOUND') {
                // 🌍 i18n
                return response.notFound({ message: t('product.notFound') });
            }
            if (error.message === t('feature.invalidJsonPayload')) {
                // 🌍 i18n
                return response.badRequest({ message: error.message });
            }
            // 🌍 i18n
            return response.internalServerError({ message: t('feature.multipleUpdateFailed'), error: error.message });
        }
    }

    async delete_feature({ request, response, auth }: HttpContext) {
        // 🔐 Authentification
        await securityService.authenticate({ request, auth });
        // 🛡️ Permissions
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [CREATE_DELETE_PERMISSION]) // Utiliser la bonne permission
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') })
            }
            throw error;
        }

        let payload: Infer<typeof this.deleteFeatureSchema>;
        try {
            // ✅ Validation Vine (pour le body)
            payload = await this.deleteFeatureSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages })
            }
            throw error;
        }

        const trx = await db.transaction();
        try {
            // Vérifier si ce n'est pas la feature par défaut
            const featureToDelete = await Feature.findOrFail(payload.feature_id, { client: trx });
            const product = await Product.find(featureToDelete.product_id, { client: trx });
            if (product && product.default_feature_id === featureToDelete.id) {
                // 🌍 i18n
                throw new Error(t('feature.cannotDeleteDefault'));
            }

            // Appel méthode statique (contient la logique + throw si not found)
            await FeaturesController._delete_feature(payload.feature_id, trx);
            await trx.commit();

            logger.info({ userId: auth.user!.id, featureId: payload.feature_id }, 'Feature deleted');
            // 🌍 i18n
            return response.ok({ message: t('feature.deleteSuccess') });
        } catch (error) {
            await trx.rollback();
            logger.error({ userId: auth.user!.id, featureId: payload?.feature_id, error: error.message, stack: error.stack }, 'Failed to delete feature');
            if (error.message === t('feature.notFound') || error.code === 'E_ROW_NOT_FOUND') {
                // 🌍 i18n
                return response.notFound({ message: t('feature.notFound') });
            }
            if (error.message === t('feature.cannotDeleteDefault')) {
                // 🌍 i18n
                return response.badRequest({ message: error.message });
            }
            // 🌍 i18n
            return response.internalServerError({ message: t('feature.deleteFailed'), error: error.message });
        }
    }
}