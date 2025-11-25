import Categorie from '#models/categorie'
import Feature from '#models/feature';
import Product from '#models/product'
import Value from '#models/value';
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db';
// import { features } from 'process'; // Supprimé car non utilisé et potentiellement conflictuel
import vine from '@vinejs/vine'; // ✅ Ajout de Vine

import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import logger from '@adonisjs/core/services/logger'; // Ajout pour logs
import { TypeJsonRole } from '#models/role'; // Pour type permissions
import User from '#models/user'; // Importer User pour la recherche future
import UserOrder from '#models/user_order'; // Importer UserOrder pour la recherche future
import { v4 } from 'uuid';
import { securityService } from '#services/SecurityService';

// Permissions requises (à définir - exemple)
const SEARCH_PERMISSION: keyof TypeJsonRole = 'filter_product'; // Ou une permission plus globale?
const IMPORT_EXPORT_PERMISSION: keyof TypeJsonRole = 'manage_interface'; // Permission pour import/export

export default class GlobaleServicesController {

    // --- Schémas de validation Vine ---
    private globalSearchSchema = vine.compile(
        vine.object({
            text: vine.string().trim().minLength(1).optional(), // Recherche optionnelle pour retourner un objet vide si absent
        })
    );

    private importStoreSchema = vine.compile(
        vine.object({
            products: vine.array(vine.any()).optional(), // Validation simple du tableau
            categories: vine.array(vine.any()).optional(), // Validation simple du tableau
        })
    );

    // Pas de schéma pour l'export car il ne prend pas de paramètres dans le body/query

    // --- Méthodes du contrôleur ---

    async global_search({ request, response, auth }: HttpContext) {
        // 🔐 Authentification (requis pour rechercher)
        await securityService.authenticate({ request, auth });
        // 🛡️ Permissions (requis pour utiliser la recherche globale)
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [SEARCH_PERMISSION]) // Permission à définir
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: "Vous n'avez pas la permission d'effectuer cette action." })
            }
            throw error;
        }

        let payload: Infer<typeof this.globalSearchSchema>;
        try {
            // ✅ Validation Vine pour Query Params
            payload = await this.globalSearchSchema.validate(request.qs());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.badRequest({ message: "La validation des données a échoué.", errors: error.messages })
            }
            throw error;
        }

        console.log(payload);

        const text = payload.text; // Peut être undefined si non fourni

        // Retourner un objet vide si pas de texte de recherche
        if (!text) {
            return response.ok({
                products: [],
                categories: [],
                clients: [], // Garder la structure même si vide
                commands: [], // Garder la structure même si vide
            });
        }

        try {
            let productsQuery: Promise<any>; // Utiliser Promise<any> pour flexibilité entre .first() et .limit()
            let categoriesQuery: Promise<any>;
            let clientsQuery: Promise<any>;
            let commandsQuery: Promise<any>;

            const searchLimit = 5; // Limite de résultats par type

            if (text.startsWith('#')) {
                // 🔍 Recherche par ID
                const searchTerm = text.substring(1).toLowerCase(); // Retirer '#' et mettre en minuscule pour UUID
                const searchPattern = `${searchTerm}%`; // Ajouter wildcard pour ILIKE

                // Utiliser whereRaw pour caster en TEXT avant ILIKE pour les UUIDs
                productsQuery = Product.query()
                    .whereRaw('LOWER(CAST(id AS TEXT)) LIKE ?', [searchPattern])
                    // 🔍 GET par ID -> .first()
                    .first();

                categoriesQuery = Categorie.query()
                    .whereRaw('LOWER(CAST(id AS TEXT)) LIKE ?', [searchPattern])
                    // 🔍 GET par ID -> .first()
                    .first();

                // Recherche Client par ID (UUID)
                clientsQuery = User.query()
                    // .where('role_type', 'client') // Assurer qu'on cherche bien un client
                    .whereRaw('LOWER(CAST(id AS TEXT)) LIKE ?', [searchPattern])
                    // 🔍 GET par ID -> .first()
                    .first();

                // Recherche Commande par ID (UUID) ou Reference
                commandsQuery = UserOrder.query()
                    .where((query) => {
                        query.whereRaw('LOWER(CAST(id AS TEXT)) LIKE ?', [searchPattern])
                            .orWhereILike('reference', searchPattern); // La référence est peut-être déjà text
                    })
                    // 🔍 GET par ID -> .first()
                    .first();

            } else {
                // 🔍 Recherche par nom/description/email etc.
                const searchTerm = `%${text.toLowerCase().split(" ").join('%')}%`;

                productsQuery = Product.query()
                    .where((query) => {
                        query.whereILike('name', searchTerm)
                            .orWhereILike('description', searchTerm);
                    }).preload('features', (featureQuery) => {
                        featureQuery
                            .orderBy('features.index', 'asc')
                            .preload('values', (valueQuery) => {
                                valueQuery.orderBy('values.index', 'asc')
                            });
                    })
                    .paginate(1,searchLimit)
                    
                categoriesQuery = Categorie.query()
                    .where((query) => {
                        query.whereILike('name', searchTerm)
                            .orWhereILike('description', searchTerm);
                    })
                    .paginate(1,searchLimit)
                
                // Recherche Client par Nom/Email
                clientsQuery = User.query()
                    // .where('role_type', 'client')
                    .where((query) => {
                        query.whereILike('full_name', searchTerm)
                            .orWhereILike('email', searchTerm);
                    })
                    .paginate(1,searchLimit)
                
                // Recherche Commande par infos client ou référence
                commandsQuery = UserOrder.query()
                    .whereILike('reference', searchTerm)
                    // Peut-être ajouter recherche par nom/email du client associé?
                    .orWhereHas('user', (userQuery) => {
                        userQuery.whereILike('full_name', searchTerm)
                            .orWhereILike('email', searchTerm);
                    })
                    .preload('user', (userQuery) => userQuery.select(['id', 'full_name', 'email'])) // Preload user pour affichage
                    .paginate(1,searchLimit)
             }

            // Exécuter les requêtes en parallèle
            const [productsRes, categoriesRes, clientsRes, commandsRes] = await Promise.all([
                productsQuery,
                categoriesQuery,
                clientsQuery,
                commandsQuery,
            ]);

            console.log(productsRes);

            // Formater la réponse (mettre dans un tableau même si .first() a retourné un seul objet ou null)
            return response.ok({
                products: productsRes.all(),
                categories: categoriesRes.all(),
                clients: clientsRes.all(),
                commands: commandsRes.all(),
                meta: {
                    products: productsRes.getMeta().total,
                    categories: categoriesRes.getMeta().total,
                    clients: clientsRes.getMeta().total,
                    commands: commandsRes.getMeta().total,
                }
            });

        } catch (error) {
            logger.error({ userId: auth.user!.id, searchText: text, error: error.message, stack: error.stack }, 'Global search failed');
            // 🌍 i18n
            return response.internalServerError({ message: "searchFailed.", error: error.message }); // Nouvelle clé
        }
    }

    async import_store({ request, response, auth }: HttpContext) {
        // 🔐 Authentification
        await securityService.authenticate({ request, auth });
        // 🛡️ Permissions
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [IMPORT_EXPORT_PERMISSION])
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: "Vous n'avez pas la permission d'effectuer cette action." })
            }
            throw error;
        }

        let payload: Infer<typeof this.importStoreSchema>;
        try {
            // ✅ Validation Vine (simple, pourrait être plus stricte sur la structure interne)
            payload = await this.importStoreSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                // 🌍 i18n
                return response.unprocessableEntity({ message: "La validation des données a échoué.", errors: error.messages })
            }
            throw error;
        }

        const { products, categories } = payload; // Utiliser payload validé

        if (!products && !categories) {
            // 🌍 i18n
            return response.badRequest({ message: "noDataToImport." }); // Nouvelle clé
        }

        const trx = await db.transaction();
        try {
            // --- Logique métier (inchangée, mais nécessite une validation plus poussée des données importées) ---
            // TODO: Ajouter une validation BEAUCOUP plus stricte des objets 'product' et 'category'
            // avant de tenter de les insérer pour éviter les erreurs DB.
            // Utiliser des schémas Vine complexes ou une librairie comme Zod.

            if (Array.isArray(products)) {
                for (const productData of products) {
                    // **Validation Stricte de productData ici**
                    // Créer Product
                    const newProduct = await Product.create({ ...productData, id: v4() }, { client: trx }); // Générer nouvel ID

                    if (Array.isArray(productData.features)) {
                        for (const featureData of productData.features) {
                            // **Validation Stricte de featureData ici**
                            // Créer Feature
                            const newFeature = await Feature.create({ ...featureData, id: v4(), product_id: newProduct.id }, { client: trx }); // Lier au nouveau produit

                            if (Array.isArray(featureData.values)) {
                                for (const valueData of featureData.values) {
                                    // **Validation Stricte de valueData ici**
                                    // Créer Value
                                    await Value.create({ ...valueData, id: v4(), feature_id: newFeature.id }, { client: trx }); // Lier à la nouvelle feature
                                }
                            }
                        }
                    }
                }
            }

            if (Array.isArray(categories)) {
                for (const categoryData of categories) {
                    // **Validation Stricte de categoryData ici**
                    // Créer Category
                    await Categorie.create({ ...categoryData, id: v4() }, { client: trx }); // Générer nouvel ID
                }
            }
            // --- Fin logique métier ---

            await trx.commit();
            logger.info({ userId: auth.user!.id }, 'Store data imported successfully');
            // 🌍 i18n
            return response.ok({ message: "importSuccess." }); // Nouvelle clé

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: auth.user!.id, error: error.message, stack: error.stack }, 'Store import failed');
            // 🌍 i18n
            return response.internalServerError({ message: "importFailed.", error: error.message }); // Nouvelle clé
        }
    }

    async export_store({ response, auth, request }: HttpContext) {
        // 🔐 Authentification
        await securityService.authenticate({ request, auth });
        // 🛡️ Permissions
        try {
            await request.ctx?.bouncer.authorize('collaboratorAbility', [IMPORT_EXPORT_PERMISSION])
        } catch (error) {
            if (error.code === 'E_AUTHORIZATION_FAILURE') {
                // 🌍 i18n
                return response.forbidden({ message: "Vous n'avez pas la permission d'effectuer cette action." })
            }
            throw error;
        }

        try {
            // --- Logique métier (inchangée) ---
            const categories = await Categorie.all();
            const products = await Product.query().select("*").preload('features', (featureQuery) => {
                featureQuery
                    .orderBy('created_at', 'asc')
                    .preload('values', (valueQuery) => {
                        valueQuery.orderBy('created_at', 'asc')
                    });
            }).exec(); // Utiliser exec() pour obtenir directement le tableau
            // --- Fin logique métier ---

            logger.info({ userId: auth.user!.id }, 'Store data exported successfully');
            // Pas besoin de message i18n ici car on retourne directement les données
            return response.ok({
                categories: categories.map(c => c.toJSON()), // Assurer la sérialisation propre
                products: products.map(p => p.toJSON())   // Assurer la sérialisation propre
            });

        } catch (error) {
            logger.error({ userId: auth.user!.id, error: error.message, stack: error.stack }, 'Store export failed');
            // 🌍 i18n
            return response.internalServerError({ message: "exportFailed.", error: error.message }); // Nouvelle clé
        }
    }
}