import Value from '#models/value'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { v4 } from 'uuid'
import { updateFiles } from './Utils/media/UpdateFiles.js'
import { EXT_IMAGE, EXT_VIDEO, MEGA_OCTET } from './Utils/ctrlManager.js'
import { createFiles } from './Utils/media/CreateFiles.js'
import { deleteFiles } from './Utils/media/DeleteFiles.js'
import { MAX_PRICE } from './Utils/constants.js'
import Feature, { FeatureType } from '#models/feature'
import vine from '@vinejs/vine' // ✅ Ajout de Vine
import { t } from '../utils/functions.js'; // ✅ Ajout de t
import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import logger from '@adonisjs/core/services/logger'; // Ajout pour logs
import { TypeJsonRole } from '#models/role' // Pour type permissions

// Interfaces (conservées pour la méthode checkValidValue)
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
    icon?: string[],
    required?: boolean,
    regex?: string,
    min?: number,
    max?: number,
    min_size?: number,
    max_size?: number,
    index?: number,
    multiple?: boolean,
    is_double?: boolean,
    default_value?: string|null,
    created_at: string,
    updated_at: string,
    values?: ValueInterface[];
};
// Fin Interfaces

// Permissions requises pour ce contrôleur (assumant les mêmes que pour les produits)
const EDIT_PERMISSION: keyof TypeJsonRole = 'edit_product';
// const CREATE_DELETE_PERMISSION: keyof TypeJsonRole = 'create_delete_product';


// --- Fonction de validation métier (gardée car spécifique à Value/Feature) ---
const checkValidValue = (feature: FeatureInterface | null, value: Partial<ValueInterface>) => {
  if (!feature) {
    // 🌍 i18n
    throw new Error(t('feature.notFound')); // Impossible de valider sans la feature parente
  }
  if (feature.type === FeatureType.COLOR) {
    if (!value.key || !/^#[0-9A-Fa-f]{6}$/i.test(value.key)) {
      // 🌍 i18n
      throw new Error(t('value.invalidColorKey', { key: value.key, value: JSON.stringify(value) }));
    }
    if (!value.text || value.text.trim().length < 1) {
      // 🌍 i18n
      throw new Error(t('value.textRequired'));
    }
  } else if (feature.type && [FeatureType.ICON_TEXT, FeatureType.TEXT, FeatureType.ICON].includes(feature.type)) {
    if (!value.text || value.text.trim().length < 1) {
      // 🌍 i18n
      throw new Error(t('value.textRequired'));
    }
  }
  // Ajouter d'autres validations métier si nécessaire pour d'autres FeatureType
}
// --- Fin fonction validation métier ---


export default class ValuesController {

    // --- Schémas de validation Vine ---
    private createValueSchema = vine.compile(
      vine.object({
        feature_id: vine.string().uuid(),
        additional_price: vine.number().min(0).max(MAX_PRICE).optional(),
        currency: vine.string().optional(), // Pourrait être un enum si plus de devises sont gérées
        text: vine.string().trim().minLength(1).maxLength(255).optional(), // Optionnel car peut être déduit ou non requis
        key: vine.string().trim().maxLength(255).optional().nullable(), // Peut être null
        stock: vine.number().min(0).optional().nullable(),
        decreases_stock: vine.boolean().optional(),
        continue_selling: vine.boolean().optional(),
        index: vine.number().positive().optional(),
        // 'views' et 'icon' gérés par createFiles
      })
    );

    private getValuesSchema = vine.compile(
        vine.object({
            feature_id: vine.string().uuid().optional(),
            value_id: vine.string().uuid().optional(),
            text: vine.string().trim().optional(),
            page: vine.number().positive().optional(),
            limit: vine.number().positive().optional(),
        })
    );

    private updateValueSchema = vine.compile(
        vine.object({
            value_id: vine.string().uuid(), // ID de la value à mettre à jour (dans le body)
            id: vine.string().uuid().optional(), // Accepter 'id' comme alias
            feature_id: vine.string().uuid(), // Toujours requis pour checkValidValue
            additional_price: vine.number().min(0).max(MAX_PRICE).optional(),
            currency: vine.string().optional(),
            text: vine.string().trim().minLength(1).maxLength(255).optional(),
            key: vine.string().trim().maxLength(255).optional().nullable(),
            stock: vine.number().min(0).optional().nullable(),
            decreases_stock: vine.boolean().optional(),
            continue_selling: vine.boolean().optional(),
            index: vine.number().positive().optional(),
            views: vine.array(vine.string()).optional(), // Pour updateFiles (pseudo URLs)
            icon: vine.array(vine.string()).optional(), // Pour updateFiles (pseudo URLs)
        })
    );

    private deleteValueParamsSchema = vine.compile(
        vine.object({
            id: vine.string().uuid(), // ID dans l'URL
        })
    );

    // --- Méthodes Statiques (appelées par d'autres contrôleurs) ---
    // Ces méthodes ne gèrent PAS l'authentification/autorisation car elles sont appelées
    // dans le contexte d'une action déjà autorisée (ex: multiple_update).
    // Elles ne renvoient pas de réponse HTTP mais l'objet créé/mis à jour ou lèvent une erreur.
    public static async _create_value(request: HttpContext['request'], payload: Infer<typeof ValuesController.prototype.createValueSchema>, id: string, trx: any) {
        logger.debug({ payload, id }, '_create_value called');

        const feature = await Feature.find(payload.feature_id); // Pas findOrFail ici, gérer l'erreur
        if (!feature) {
             // 🌍 i18n
             throw new Error(t('feature.notFound'));
        }

        checkValidValue(feature as any, payload); // Validation métier

        // Gestion Fichiers
        let distinct = ([...(request.input('views', [])), ...(request.input('icon', []))])?.find(f => f.includes(':'))
        distinct = distinct?.substring(0, distinct.indexOf(':'));

        let viewsUrls = await createFiles({
          request,
          column_name: "views", // Nom du champ dans la requête form-data
          table_id: id,
          table_name: Value.table,
          distinct,
          options: { throwError: true, compress: 'img', min: 0, max: 5, extname: [...EXT_IMAGE, ...EXT_VIDEO], maxSize: 12 * MEGA_OCTET, },
        });
        let iconUrls = await createFiles({
          request,
          column_name: "icon", // Nom du champ dans la requête form-data
          table_id: id,
          table_name: Value.table,
          distinct,
          options: { throwError: true, compress: 'img', min: 0, max: 1, extname: EXT_IMAGE, maxSize: 5 * MEGA_OCTET, },
        });

        // Préparation données (défaults)
        const stock = payload.stock;
        const index = payload.index ?? 1; // Default index 1
        const additional_price = payload.additional_price;

        const newValue = await Value.create({
          id: id,
          feature_id: payload.feature_id,
          stock: stock?? undefined,
          decreases_stock: !!payload.decreases_stock,
          continue_selling: !!payload.continue_selling,
          index: index <= 0 ? 1 : index, // Assurer positif
          additional_price: additional_price,
          currency: payload.currency,
          text: payload.text, // Utiliser directement car validé
          key: payload.key??undefined,   // Utiliser directement car validé
          icon: ((!iconUrls || iconUrls.length === 0) ? (viewsUrls[0] ? [viewsUrls[0]] : []) : iconUrls),
          views: viewsUrls,
        }, { client: trx })

        logger.debug({ valueId: newValue.id }, '_create_value successful');
        return newValue
    }

    public static async _update_value(request: HttpContext['request'], value_id: string, payload: Partial<Infer<typeof ValuesController.prototype.updateValueSchema>>, trx: any) {
        logger.debug({ value_id, payload }, '_update_value called');

        const value = await Value.findOrFail(value_id, { client: trx });

        // Récupérer la feature associée pour la validation métier
        const feature = await Feature.findOrFail(payload.feature_id || value.feature_id); // Utiliser l'ID du payload ou celui existant
        checkValidValue(feature as any, payload); // Validation métier

        // Préparation données (défaults/parsing)
        const stock = payload.stock??undefined;
        const index = payload.index;
        const additional_price = payload.additional_price;

        const dataToMerge: Partial<Value> = {
          ...(payload.text !== undefined && { text: payload.text }),
          ...(payload.key !== undefined && { key: payload.key??undefined }),
          ...(stock !== undefined && { stock: stock > MAX_PRICE ? MAX_PRICE : (stock < 0 ? 0 : stock) }),
          ...(payload.decreases_stock !== undefined && { decreases_stock: !!payload.decreases_stock }),
          ...(payload.continue_selling !== undefined && { continue_selling: !!payload.continue_selling }),
          ...(index !== undefined && { index: index <= 0 ? value.index : index }), // Garder l'ancien si invalide? Ou mettre 1?
          ...(additional_price !== undefined && { additional_price: additional_price > MAX_PRICE ? MAX_PRICE : (additional_price < 0 ? 0 : additional_price) }),
          ...(payload.currency !== undefined && { currency: payload.currency }),
        }

        // Gestion Fichiers
        let distinct = ([...(payload.views || []), ...(payload.icon || [])])?.find(f => f.includes(':'))
        distinct = distinct?.substring(0, distinct.indexOf(':'));

        if (payload.views) {
            const updatedViewsUrls = await updateFiles({
                request, table_name: Value.table, table_id: value_id, column_name: 'views',
                lastUrls: value.views || [], newPseudoUrls: payload.views, distinct,
                options: { throwError: true, min: 0, max: 7, compress: 'img', extname: [...EXT_IMAGE, ...EXT_VIDEO], maxSize: 12 * MEGA_OCTET, },
            });
             if (updatedViewsUrls.length >= 0) dataToMerge.views = updatedViewsUrls; // Gérer suppression complète
        }
        if (payload.icon) {
            const updatedIconUrls = await updateFiles({
                request, table_name: Value.table, table_id: value_id, column_name: 'icon',
                lastUrls: value.icon || [], newPseudoUrls: payload.icon, distinct,
                options: { throwError: true, min: 0, max: 1, compress: 'img', extname: EXT_IMAGE, maxSize: 5 * MEGA_OCTET, },
            });
            if (updatedIconUrls.length >= 0) dataToMerge.icon = updatedIconUrls; // Gérer suppression complète
        }

        // Assurer qu'il y a une icône si possible après MAJ des vues/icônes
        const finalIcon = dataToMerge.icon ?? value.icon;
        const finalViews = dataToMerge.views ?? value.views;
        dataToMerge.icon = ((!finalIcon || finalIcon.length === 0) ? (finalViews?.[0] ? [finalViews[0]] : []) : finalIcon);


        value.useTransaction(trx).merge(dataToMerge);
        await value.save();

        logger.debug({ valueId: value.id }, '_update_value successful');
        return value;
    }

    public static async _delete_value(value_id: string, trx: any) {
        logger.debug({ value_id }, '_delete_value called');
        const value = await Value.findOrFail(value_id, { client: trx }); // Throw si non trouvé
        await value.useTransaction(trx).delete();
        await deleteFiles(value_id); // Nettoyage fichiers
        logger.debug({ valueId: value.id }, '_delete_value successful');
    }
    // --- Fin Méthodes Statiques ---


    // --- Méthodes Publiques (Contrôleur) ---
    async create_value({ request, response, auth, bouncer }: HttpContext) {
         // 🔐 Authentification
        await auth.authenticate();
        // 🛡️ Permissions
        try {
            await bouncer.authorize('collaboratorAbility', [EDIT_PERMISSION]) // Utiliser edit_product pour les valeurs aussi?
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: t('unauthorized_action') })
            }
            throw error;
        }

        const id = v4()
        const trx = await db.transaction();
        try {
            // ✅ Validation Vine
            // Utiliser request.all() car createFiles a besoin d'accéder aux fichiers
            const payload = await this.createValueSchema.validate(request.all());

            // Appel méthode statique
            const newValue = await ValuesController._create_value(request, payload, id, trx)
            await trx.commit()

            logger.info({ userId: auth.user!.id, valueId: newValue.id, featureId: newValue.feature_id }, 'Value created');
            // 🌍 i18n
            return response.created({ message: t('value.createdSuccess'), value: newValue });

        } catch (error) {
            await trx.rollback()
            // Nettoyage fichiers
            await deleteFiles(id).catch(delErr => logger.error({ valueIdAttempt: id, error: delErr }, 'Failed to cleanup files after value creation failure'));

            logger.error({ userId: auth.user?.id, error: error.message, stack: error.stack }, 'Failed to create value');
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages })
            }
             if (error.message === t('feature.notFound')) {
                 // 🌍 i18n
                 return response.badRequest({ message: error.message }); // Erreur métier (Feature non trouvée)
             }
             if (error.message?.includes(t('value.invalidColorKey', { key: '', value: '' }).substring(0, 10)) || // Check début des messages métier
                 error.message?.includes(t('value.textRequired').substring(0, 10))) {
                 // 🌍 i18n
                 return response.badRequest({ message: error.message }); // Erreur métier de checkValidValue
             }
            // 🌍 i18n
            return response.internalServerError({ message: t('value.creationFailed'), error: error.message })
        }
    }

    // Lecture publique
    async get_values({ request, response }: HttpContext) {
        let payload: Infer<typeof this.getValuesSchema>;
        try {
             // ✅ Validation Vine pour Query Params
             payload = await this.getValuesSchema.validate(request.qs());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                 // 🌍 i18n
                 return response.badRequest({ message: t('validationFailed'), errors: error.messages })
            }
            throw error;
        }

        try {
            const query = Value.query();
             // 🔍 GET par ID doit retourner le premier trouvé
            if (payload.value_id) {
                 const value = await query.where('id', payload.value_id).first();
                 if (!value) {
                      // 🌍 i18n
                      return response.notFound({ message: t('value.notFound') });
                 }
                 return response.ok(value); // Retourner l'objet unique
            }

            // Si pas d'ID spécifique, appliquer les autres filtres et paginer
            if (payload.feature_id) query.where('feature_id', payload.feature_id);
            if (payload.text) query.whereLike('text', `%${payload.text}%`);

            const page = payload.page ?? 1;
            const limit = payload.limit ?? 50; // Limite par défaut

            const valuesPaginate = await query.orderBy('index', 'asc').paginate(page, limit);

            return response.ok({ list: valuesPaginate.all(), meta: valuesPaginate.getMeta() });
        } catch (error) {
            logger.error({ error: error.message, stack: error.stack }, 'Failed to get values');
             // 🌍 i18n
            return response.internalServerError({ message: t('value.fetchFailed'), error: error.message });
        }
    }

    async update_value({ request, response, auth, bouncer }: HttpContext) {
         // 🔐 Authentification
         await auth.authenticate();
         // 🛡️ Permissions
         try {
             await bouncer.authorize('collaboratorAbility', [EDIT_PERMISSION])
         } catch (error) {
             if (error.code === 'E_AUTHORIZATION_FAILURE') {
                  // 🌍 i18n
                 return response.forbidden({ message: t('unauthorized_action') })
             }
             throw error;
         }

        const trx = await db.transaction();
        let payload: Infer<typeof this.updateValueSchema>;
        try {
             // ✅ Validation Vine
             // Utiliser request.all() pour récupérer les pseudo URLs et les fichiers potentiels
             payload = await this.updateValueSchema.validate(request.all());
             const valueId = payload.value_id || payload.id; // Utiliser value_id ou id

             if (!valueId) {
                // 🌍 i18n
                 throw new Error(t('value.idRequired')); // Devrait être attrapé par Vine, mais sécurité
             }

            // Appel méthode statique
            const value = await ValuesController._update_value(request, valueId, payload, trx);

            await trx.commit();
            logger.info({ userId: auth.user!.id, valueId: value.id }, 'Value updated');
             // 🌍 i18n
            return response.ok({ message: t('value.updateSuccess'), value: value });

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: auth.user?.id, error: error.message, stack: error.stack }, 'Failed to update value');
             if (error.code === 'E_VALIDATION_ERROR') {
                 // 🌍 i18n
                 return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages })
             }
             if (error.code === 'E_ROW_NOT_FOUND' || error.message === t('feature.notFound')) {
                  // 🌍 i18n (Erreur de findOrFail sur Value ou Feature)
                 return response.notFound({ message: t('value.orFeatureNotFound') }); // Nouvelle clé
             }
             if (error.message === t('value.idRequired') ||
                 error.message?.includes(t('value.invalidColorKey', { key: '', value: '' }).substring(0, 10)) ||
                 error.message?.includes(t('value.textRequired').substring(0, 10))) {
                  // 🌍 i18n (Erreurs métier)
                 return response.badRequest({ message: error.message });
             }
            // 🌍 i18n
            return response.internalServerError({ message: t('value.updateFailed'), error: error.message });
        }
    }

    async delete_value({ params, response, auth, bouncer }: HttpContext) {
         // 🔐 Authentification
         await auth.authenticate();
         // 🛡️ Permissions
         try {
            // Utiliser la permission de suppression produit ? Ou une plus spécifique ?
             await bouncer.authorize('collaboratorAbility', [EDIT_PERMISSION]) // Ou CREATE_DELETE_PERMISSION
         } catch (error) {
             if (error.code === 'E_AUTHORIZATION_FAILURE') {
                  // 🌍 i18n
                 return response.forbidden({ message: t('unauthorized_action') })
             }
             throw error;
         }

        let payload: Infer<typeof this.deleteValueParamsSchema>;
        try {
             // ✅ Validation Vine pour Params
            payload = await this.deleteValueParamsSchema.validate(params);
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: t('validationFailed'), errors: error.messages })
            }
            throw error;
        }

        const trx = await db.transaction();
        try {
            // Appel méthode statique
            await ValuesController._delete_value(payload.id, trx);
            await trx.commit();

            logger.info({ userId: auth.user!.id, valueId: payload.id }, 'Value deleted');
            // 🌍 i18n
            // Le standard pour DELETE succès est 204 No Content sans body
            return response.noContent(); // Changé de response.ok()

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: auth.user!.id, valueId: payload?.id, error: error.message, stack: error.stack }, 'Failed to delete value');
             if (error.code === 'E_ROW_NOT_FOUND') {
                  // 🌍 i18n
                 return response.notFound({ message: t('value.notFound') });
             }
            // 🌍 i18n
            return response.internalServerError({ message: t('value.deleteFailed'), error: error.message });
        }
    }
}