import Product from '#models/product';
import type { HttpContext } from '@adonisjs/core/http'
import { v4 } from 'uuid';
import { applyOrderBy } from './Utils/query.js'; // Gardé tel quel
import { EXT_IMAGE, EXT_VIDEO, MEGA_OCTET } from './Utils/ctrlManager.js'; // Gardé tel quel
import Feature, { FeatureType } from '#models/feature';
import Value from '#models/value';
import { createFiles } from './Utils/media/CreateFiles.js'; // Gardé tel quel
import Categorie from '#models/categorie';
import { ModelPaginatorContract, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'; // Gardé tel quel
import db from '@adonisjs/lucid/services/db';
import { CURRENCY } from '#models/user_order';
import FeaturesController from './features_controller.js'; // Gardé tel quel
import { MAX_PRICE } from './Utils/constants.js'; // Gardé tel quel
import vine from '@vinejs/vine'; // ✅ Ajout de Vine
import { t, normalizeStringArrayInput } from '../utils/functions.js'; // ✅ Ajout de t et normalize
import logger from '@adonisjs/core/services/logger'; // Ajout pour logs
import { Infer } from '@vinejs/vine/types';
import Detail from '#models/detail';
import DetailsController from './details_controller.js';
import { securityService } from '#services/SecurityService';
import Favorite from '#models/favorite';
import FavoritesController from './favorites_controller.js';

export default class ProductsController {

  // --- Schémas de validation Vine ---
  private createProductSchema = vine.compile(
    vine.object({
      name: vine.string().trim().minLength(1),
      description: vine.string().trim().optional(),
      price: vine.number().positive(),
      categories_id: vine.any().optional(), // Sera normalisé plus tard
      barred_price: vine.number().positive().optional().nullable(),
      is_visible: vine.boolean().optional(),
      view: vine.any().optional(),
      icon: vine.any().optional(),
    })
  );

  private getProductsQuerySchema = vine.compile(
    vine.object({
      product_id: vine.string().uuid().optional(),
      list_product_ids: vine.any().optional(),
      search: vine.string().trim().optional(),
      order_by: vine.string().trim().optional(),
      categories_id: vine.any().optional(), // Sera normalisé plus tard
      slug_cat: vine.string().trim().optional(),
      slug_product: vine.string().trim().optional(),
      filters: vine.record(vine.any()).optional(), // Validation simple pour l'objet filters
      page: vine.number().positive().optional(),
      limit: vine.number().positive().optional(),
      min_price: vine.number().min(0).optional(),
      max_price: vine.number().min(0).optional(),
      with_feature: vine.boolean().optional(),
      with_categories: vine.boolean().optional(),
      with_all: vine.boolean().optional(),
      is_visible: vine.boolean().optional(),
    })
  );

  private updateProductSchema = vine.compile(
    vine.object({
      name: vine.string().trim().minLength(1).optional(),
      description: vine.string().trim().optional().nullable(),
      categories_id: vine.any().optional(), // Sera normalisé plus tard
      barred_price: vine.number().positive().optional().nullable(),
      price: vine.number().positive().optional(),
      is_visible: vine.boolean().optional(),
      currency: vine.enum(Object.values(CURRENCY)).optional(), // Valide contre l'enum CURRENCY
    })
  );

  private productIdParamsSchema = vine.compile(
    vine.object({
      id: vine.string().uuid(),
    })
  );

  // --- Méthodes du contrôleur ---

  async create_product({ request, response, auth }: HttpContext) {
    // 🔐 Authentification
    await securityService.authenticate({ request, auth });
    // 🛡️ Permissions
    try {
      await request.ctx?.bouncer.authorize('collaboratorAbility', ['create_delete_product'])
    } catch (error) {
      if (error.code === 'E_AUTHORIZATION_FAILURE') {
        // 🌍 i18n
        return response.forbidden({ message: t('unauthorized_action') })
      }
      throw error; // Relancer les autres erreurs
    }

    const trx = await db.transaction()
    const feature_id = v4()
    const product_id = v4()
    const value_id = v4()

    console.log(request.all());

    try {
      // ✅ Validation Vine
      const data = request.all()
      const preparedData = {
        ...data,
        price: data.price ? Number(data.price) : undefined,
        barred_price: data.barred_price && data.barred_price !== 'undefined'
          ? Number(data.barred_price)
          : null,
        is_visible: data.is_visible === 'true' ? true : false,
        view: data.view, // reste tel quel
        icon: data.icon, // reste tel quel
        description: data.description || ''
      };

      const payload = await this.createProductSchema.validate(preparedData)

      // 📦 Normalisation (après validation)
      let normalizedCategories: string[] = [];
      if (payload.categories_id) {
        try {
          normalizedCategories = normalizeStringArrayInput({ categories_id: payload.categories_id }).categories_id;
          // Optionnel: Vérifier que ce sont bien des UUIDs si nécessaire ici
        } catch (error) {
          // 🌍 i18n
          return response.badRequest({ message: t('invalid_value', { key: 'categories_id', value: payload.categories_id }) })
        }
      }

      // Gestion des fichiers
      const views = await createFiles({
        request,
        column_name: 'views',
        table_id: value_id,
        table_name: Value.table,
        options: { throwError: true, min: 1, max: 10, extname: [...EXT_IMAGE, ...EXT_VIDEO], maxSize: 12 * MEGA_OCTET },
      })
      const icon = await createFiles({
        request,
        column_name: 'icon',
        table_id: value_id,
        table_name: Value.table,
        options: { throwError: true, min: 0, max: 1, extname: EXT_IMAGE, maxSize: 2 * MEGA_OCTET },
      })

      if (!views.length) {
        // 🌍 i18n
        throw new Error(t('product.viewRequired')) // Nouvelle clé i18n
      }

      // --- Logique métier (inchangée mais utilise payload validé/normalisé) ---
      let price = payload.price; // Déjà number grâce à Vine
      let barred_price = payload.barred_price; // Déjà number ou null grâce à Vine

      // Les vérifications MAX_PRICE et prix > 0 restent valides comme logique métier supplémentaire
      if (price > MAX_PRICE) throw new Error(t('product.priceTooHigh', { max: MAX_PRICE })); // Nouvelle clé
      if (barred_price && barred_price > MAX_PRICE) throw new Error(t('product.barredPriceTooHigh', { max: MAX_PRICE })); // Nouvelle clé
      if (barred_price && (barred_price <= 0)) throw new Error(t('product.barredPriceInvalid')); // Nouvelle clé
      if (price <= 0) throw new Error(t('product.priceInvalid')); // Nouvelle clé

      const product = await Product.create({
        id: product_id,
        name: payload.name.replace(/\s+/g, ' '), // Utiliser payload validé
        description: payload.description?.trim().substring(0, 1024),
        price: price,
        categories_id: normalizedCategories, // Utiliser le tableau normalisé
        barred_price: barred_price,
        default_feature_id: feature_id,
        is_visible: true,
        currency: CURRENCY.FCFA, // Ou récupérer depuis payload si ajouté au schema
      }, { client: trx })

      const feature = await Feature.create({
        id: feature_id,
        product_id,
        name: 'Les variantes visuels du produit', // Nom par défaut de la feature
        required: false,
        type: FeatureType.ICON_TEXT,
        default_value: null,
        icon: [],
        is_default: true,
        index: 0,
      }, { client: trx })

      const newValue = await Value.create({
        id: value_id,
        feature_id,
        views,
        text: 'Texture',
        index: 0,
        icon: ((!icon || icon.length == 0) ? views[0] && [views[0]] : icon) || [],
      }, { client: trx })

      await trx.commit()
      logger.info({ userId: auth.user!.id, productId: product.id }, 'Product created');
      // 🌍 i18n
      return response.created({
        message: t('product.createdSuccess'), // Nouvelle clé
        product: { ...product.toJSON(), features: [{ ...feature.toJSON(), values: [newValue.toJSON()] }] }
      })

    } catch (error) {
      await trx.rollback()
      logger.error({ userId: auth.user?.id, error: error.message, stack: error.stack }, 'Failed to create product');
      // Gérer erreurs de validation Vine
      if (error.code === 'E_VALIDATION_ERROR') {
        return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages })
      }
      // 🌍 i18n
      return response.internalServerError({ message: t('product.creationFailed'), error: error.message }) // Nouvelle clé
    }
  }

  // --- Fonctions privées utilitaires (inchangées) ---
  private getPaginationParams(page?: number, limit?: number): { pageNum: number; limitNum: number } {
    return {
      pageNum: page && page > 0 ? page : 1,
      limitNum: limit && limit > 0 ? limit : 20, // Augmenté la limite par défaut
    }
  }

  private applySearch(query: ModelQueryBuilderContract<typeof Product>, search?: string) {
    if (search) {
      if (search.startsWith('#')) {
        const searchTerm = search.substring(1).toLowerCase();
        const searchPattern = `${searchTerm}%`;
        query.whereRaw('LOWER(CAST(id AS TEXT)) LIKE ?', [searchPattern])
          .first()
      } else {
        const searchTerm = `%${search.toLowerCase().split(' ').join('%')}%`;
        query.where(q => {
          q.whereILike('name', searchTerm)
            .orWhereILike('description', searchTerm);
        });
      }
    }
    return query
  }
  private applyFilters(query: ModelQueryBuilderContract<typeof Product>, filters: Record<string, {
    text: string;
    key: string | null;
  }[]>) {
    Object.entries(filters).forEach(([featureName, filterValues]) => {
      query.whereHas('features', (featureQuery) => {
        featureQuery.whereRaw('LOWER(name) = ?', [featureName.toLowerCase()])
          .whereHas('values', (valueQuery) => {
            valueQuery.where((subQuery) => {
              filterValues.forEach((filterValue) => {
                subQuery.orWhere((clause) => {
                  clause.whereRaw('LOWER(text) = ?', [filterValue.text.toLowerCase()]);
                  if (filterValue.key !== null) {
                    clause.andWhere('key', filterValue.key);
                  } else {
                    clause.andWhereNull('key');
                  }
                });
              });
            });
          });
      });
    });
    return query;
  }
  /**
       * Récupère des produits similaires (cross-selling) basés sur les catégories.
       */
  public async get_similar_products({ params, response }: HttpContext) {
    try {
      const { slug } = params;
      if (!slug) {
        return response.badRequest({ message: 'Le slug du produit est requis.' })
      }

      // On appelle notre nouvelle méthode plus claire.
      const similarProducts = await Product.getSimilarProductsByCategory(slug, 8);

      return response.ok(similarProducts);

    } catch (error) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: t('product.notFound') });
      }

      logger.error({ slug: params.slug, error: error.message, stack: error.stack }, 'Failed to get similar products');
      return response.internalServerError({ message: t('product.fetchRelatedFailed') }); // Vous pouvez créer une clé i18n dédiée.
    }
  }
  // Lecture publique, pas d'auth/bouncer requis
  public async get_products({ request, response, auth }: HttpContext) { // Retiré auth, bouncer

    let payload: Infer<typeof this.getProductsQuerySchema>;

    try {
      // ✅ Validation Vine pour Query Params
      payload = await this.getProductsQuerySchema.validate(request.qs());

      console.log('PAYLOAD REÇU:', JSON.stringify(payload, null, 2)); // Log n°1

    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        // 🌍 i18n
        return response.badRequest({ message: t('validationFailed'), errors: error.messages })
      }
      throw error;
    }

    console.log(request.qs(), payload);
    // 📦 Normalisation (après validation)
    let normalizedCategories: string[] | undefined = undefined;
    let normalizedListProductsIds: string[] = [];
    if (payload.categories_id) {
      try {
        normalizedCategories = normalizeStringArrayInput({ categories_id: payload.categories_id }).categories_id;
        normalizedListProductsIds = normalizeStringArrayInput({ list_product_ids: payload.list_product_ids }).list_product_ids;
      } catch (error) {
        // 🌍 i18n
        console.log(error);

        return response.badRequest({ message: t('invalid_value', { key: 'categories_id', value: payload.categories_id }) })
      }
    }

    let isManager = false;

    try {
      await securityService.authenticate({ auth, request })
      await request.ctx?.bouncer.authorize('collaboratorAbility', ['edit_product'])
     
      isManager = true;
    } catch { }

    const { pageNum, limitNum } = this.getPaginationParams(payload.page, payload.limit)

    try {
      let products: ModelPaginatorContract<Product>
      let category: Categorie | null = null

      let query = Product.query().select('*')
      if (!isManager) {
        query.where('is_visible', true);
      }

      if (payload.with_all || payload.with_feature) {
        query = query.preload('features', (featureQuery) => {
          featureQuery
            .orderBy('features.index', 'asc')
            .preload('values', (valueQuery) => {
              valueQuery.orderBy('values.index', 'asc')
            });
        })
      }

      if (normalizedListProductsIds?.length > 0) {
        query.whereIn('id', normalizedListProductsIds)
      }

      if (payload.slug_cat) {
        console.log('Application du filtre de catégorie...');
        const categoryIds = await Categorie.get_all_category_ids_by_slug(payload.slug_cat)
        query = query.whereRaw('"categories_id"::jsonb \\?| ?', [categoryIds]);
        category = await Categorie.query()
          .where('slug', payload.slug_cat)
          .select('id', 'name', 'description', 'view')
          .first()
      }

      if (payload.slug_product) query.where('slug', payload.slug_product)
      if (payload.product_id) query.where('id', payload.product_id).limit(1);
      if (payload.is_visible !== undefined && payload.is_visible !== null) {
        if (payload.is_visible === true) {
          query = query.where(qb => {
            qb.where('is_visible', true).orWhereNull('is_visible');
          });
        } else {
          query = query.where('is_visible', false);
        }
      }
      if (normalizedCategories && normalizedCategories.length > 0) {
        query = query.whereRaw('"categories_id"::jsonb \\?| ?', [normalizedCategories]);
      }

      if (payload.min_price || payload.max_price) {
        query = query.whereBetween('price', [
          payload.min_price ?? 0,
          payload.max_price ?? MAX_PRICE,
        ]);
      }

      if (payload.filters) {
        const filtersTransformed: Record<string, { text: string; key: string | null }[]> = {};
        Object.entries(payload.filters).forEach(([featureName, values]) => {
          if (featureName === 'min_price' || featureName === 'max_price' || featureName === 's' || featureName === 'order_by') {
            return;
          }
          if (Array.isArray(values)) {
            filtersTransformed[featureName] = values.map(val => ({
              text: val.text,
              key: val.key === 'null' ? null : val.key,
            }));
          } else {
            logger.warn({ featureName, values }, "Invalid format for filters value, expected an array.");
          }
        });
        if (Object.keys(filtersTransformed).length > 0) {
          query = this.applyFilters(query, filtersTransformed);
        }
      }
      query = this.applySearch(query, payload.search)

      query = applyOrderBy(query, payload.order_by || 'date_desc', Product.table)


      products = await query.paginate(pageNum, limitNum)
      const list = products.all()
      if (payload.with_all || payload.with_categories) {
        const promises = products.all().map((p) => new Promise(async (rev) => {
          const cats = await Categorie.findMany(p.categories_id);
          console.log(cats);
          (p as any).categories = cats.filter(Boolean);
          rev(true)
        }))
        await Promise.allSettled(promises);
      }

      return {
        list,
        category,
        meta: products.getMeta(),
      }


    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'Failed to get products');
      // 🌍 i18n (Remplacer le message générique)
      // Gérer spécifiquement l'erreur si la catégorie n'est pas trouvée
      if (error.message?.includes("Aucune catégorie trouvée avec le slug") || error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: t('category.notFound') }); // Nouvelle clé
      }
      return response.status(500).json({
        success: false,
        message: t('product.fetchFailed'),
        error: error.message
      })
    }
  }

  async update_product({ request, response, auth, params }: HttpContext) {
    // 🔐 Authentification
    await securityService.authenticate({ request, auth });
    // 🛡️ Permissions
    try {
      await request.ctx?.bouncer.authorize('collaboratorAbility', ['edit_product'])
    } catch (error) {
      if (error.code === 'E_AUTHORIZATION_FAILURE') {
        // 🌍 i18n
        return response.forbidden({ message: t('unauthorized_action') })
      }
      throw error;
    }


    let product_id = params.id

    try {
      // ✅ Validation Vine
      const payload = await request.validateUsing(this.updateProductSchema)
      product_id = (await this.productIdParamsSchema.validate(params)).id

      console.log('>>>>>>', payload);

      // 📦 Normalisation
      let normalizedCategories: string[] | undefined = undefined;
      if (payload.categories_id) {
        try {
          normalizedCategories = normalizeStringArrayInput({ categories_id: payload.categories_id }).categories_id;
        } catch (error) {
          // 🌍 i18n
          return response.badRequest({ message: t('invalid_value', { key: 'categories_id', value: payload.categories_id }) })
        }
      }

      console.log({ normalizedCategories });

      const product = await Product.findOrFail(product_id)

      const updates: Partial<Product> = {}
      if (payload.name !== undefined) {
        updates.name = payload.name.replace(/\s+/g, ' ').substring(0, 56);
      }
      if (payload.description !== undefined) updates.description = payload.description?.trim().substring(0, 1024) || null
      if (normalizedCategories !== undefined) updates.categories_id = normalizedCategories || []

      if (payload.barred_price) {
        const price = (product.price || 0)
        if (payload.barred_price <= price || payload.barred_price > MAX_PRICE) {
          // 🌍 i18n
          return response.badRequest({ message: t('product.barredPriceInvalidRange', { max: MAX_PRICE }) }) // Nouvelle clé
        }
        updates.barred_price = payload.barred_price
      }
      if (payload.price !== undefined) {
        const priceNum = payload.price // Déjà number via Vine
        // Vérifications métier supplémentaires
        if (priceNum <= 0 || priceNum > MAX_PRICE) {
          // 🌍 i18n
          return response.badRequest({ message: t('product.priceInvalidRange', { max: MAX_PRICE }) }) // Nouvelle clé
        }
        updates.price = priceNum
      }
      if (payload.currency !== undefined) {
        updates.currency = payload.currency // Déjà validé par Vine enum
      }
      if (payload.is_visible !== undefined) {
        updates.is_visible = payload.is_visible // Déjà validé par Vine enum
      }

      product.merge(updates)
      await product.save()

      logger.info({ userId: auth.user!.id, productId: product.id }, 'Product updated');
      // 🌍 i18n
      return response.ok({ message: t('product.updateSuccess'), product: product.$attributes }) // Nouvelle clé

    } catch (error) {
      logger.error({ userId: auth.user?.id, error: error.message, stack: error.stack }, 'Failed to update product');
      if (error.code === 'E_VALIDATION_ERROR') {
        return response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages })
      }
      if (error.name === 'ModelNotFoundException' || error.code === 'E_ROW_NOT_FOUND') {
        // 🌍 i18n
        return response.notFound({ message: t('product.notFound') }) // Nouvelle clé
      }
      // 🌍 i18n
      return response.internalServerError({
        message: t('product.updateFailed'), // Nouvelle clé
        error: error.message,
      })
    }
  }

  async delete_product({ params, response, request, auth }: HttpContext) {
    // 🔐 Authentification
    const user = await securityService.authenticate({ request, auth });
    // 🛡️ Permissions
    try {
      await request.ctx?.bouncer.authorize('collaboratorAbility', ['create_delete_product'])
    } catch (error) {
      if (error.code === 'E_AUTHORIZATION_FAILURE') {
        // 🌍 i18n
        return response.forbidden({ message: t('unauthorized_action') })
      }
      throw error;
    }

    let payload: Infer<typeof this.productIdParamsSchema>;
    try {
      // ✅ Validation Vine pour Params
      payload = await this.productIdParamsSchema.validate(params)
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        // 🌍 i18n
        return response.badRequest({ message: t('validationFailed'), errors: error.messages })
      }
      throw error;
    }

    const trx = await db.transaction();
    try {
      const product = await Product.find(payload.id, { client: trx })
      if (!product) {
        // 🌍 i18n
        throw new Error(t('product.notFound')) // Utiliser l'erreur générique ou spécifique
      }

      // --- Logique métier (inchangée) ---
      const features = await Feature.query({ client: trx }).preload('values').where('product_id', product.id);
      await Promise.allSettled(features?.map(value => FeaturesController._delete_feature(value.id, trx)));

      const details = await Detail.query({ client: trx }).where('product_id', product.id);
      await Promise.allSettled(details.map(detail => DetailsController._delete_detail(detail.id)))

      const favorites = await Favorite.query({ client: trx }).where('product_id', product.id);
      await Promise.allSettled(favorites.map(favory => FavoritesController._delete_favorite(user, favory.id, trx)))

      const favorites2 = await Favorite.query({ client: trx }).where('product_id', product.id);

      console.log({ favorites2 });

      await product.useTransaction(trx).delete();

      await trx.commit(); // Commit avant suppression fichiers

      // Suppression des fichiers associée au produit (via values de la feature par defaut?)
      // C'est complexe car les fichiers sont sur les 'Value'. FeaturesController._delete_feature gère cela.
      // Pas besoin de deleteFiles(product.id) ici.

      logger.info({ userId: auth.user!.id, productId: payload.id }, 'Product deleted');
      // 🌍 i18n
      return response.ok({ message: t('product.deleteSuccess') }) // Nouvelle clé

    } catch (error) {
      await trx.rollback()
      logger.error({ userId: auth.user!.id, productId: payload?.id, error: error.message, stack: error.stack }, 'Failed to delete product');
      if (error.message === t('product.notFound')) { // Réutiliser la clé i18n
        return response.notFound({ message: error.message })
      }
      // 🌍 i18n
      return response.internalServerError({ message: t('product.deleteFailed'), error: error.message }) // Nouvelle clé
    }
  }
}