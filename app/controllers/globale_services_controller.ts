import Categorie from '#models/categorie'
import Feature from '#models/feature';
import Product from '#models/product'
import Value from '#models/value';
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db';
import { features } from 'process';

export default class GlobaleServicesController {
    async global_search({ request }: HttpContext) {
        const { text } = request.qs();

        console.log({ text });

        if (!text) {
            return {
                products: [],
                clients: [],
                commands: [],
                categories: [],
            };
        }

        let productsQuery, categoriesQuery;

        if (text.startsWith('#')) {
            // 🔍 Recherche par ID (ex: "#12345")
            const searchTerm = text.substring(1) + "%";

            productsQuery = Product.query().where('id', 'ILIKE', searchTerm).first();
            categoriesQuery = Categorie.query().where('id', 'ILIKE', searchTerm).first();
        } else {
            // 🔍 Recherche par nom/description (ex: "chaise bois")
            const searchTerm = `%${text.toLowerCase().split(' ').join('%')}%`;

            productsQuery = Product.query()
                .whereILike('name', searchTerm)
                .orWhereILike('description', searchTerm).preload('features', (featureQuery) => {
                    featureQuery
                        .orderBy('features.created_at', 'asc') // 🔥 Trier les features par date de création
                        .preload('values', (valueQuery) => {
                            valueQuery.orderBy('values.created_at', 'asc') // 🔥 Trier les values par date de création
                        });
                })
                .limit(5);

            categoriesQuery = Categorie.query()
                .whereILike('name', searchTerm)
                .orWhereILike('description', searchTerm)
                .limit(5);
        }

        // 🔥 Exécuter les requêtes en parallèle pour gagner du temps
        const [products, categories] = await Promise.all([
            productsQuery,
            categoriesQuery,
        ]);

        return {
            products: products || [],
            clients: [], // À implémenter
            commands: [], // À implémenter
            categories: categories || [],
        };
    }

    async import_store({ request }: HttpContext) {

        const { products, categories } = request.body();
        const trx = await db.transaction()
        try {
            if (Array.isArray(products)) {
                for (const product of products) {
                    const p = await Product.create({
                        ...product
                    }, { client: trx })
                    if (Array.isArray(product.features)) {
                        for (const feature of product.features) {
                            const f = await Feature.create({
                                ...feature
                            }, { client: trx })
                            if (Array.isArray(feature.values)) {
                                for (const value of feature.values) {
                                    const v = await Value.create({
                                        ...value
                                    }, { client: trx })
                                }
                            }
                        }
                    }
                }
            }
            if (Array.isArray(categories)) {
                for (const category of categories) {
                    const c = await Categorie.create({
                        ...category
                    }, { client: trx })
                }
            }
            trx.commit();
            return {
                ok:true
            }
        } catch (error) {
            trx.rollback();
            console.log(error);
            
        }
    }

    async export_store({ request }: HttpContext){
        const {} = request.body();
        const  categories = await Categorie.all();
        const  products = await Product.query().select('*').preload('features', (featureQuery) => {
            featureQuery
              .orderBy('features.created_at', 'asc') // 🔥 Trier les features par date de création
              .preload('values', (valueQuery) => {
                valueQuery.orderBy('values.created_at', 'asc') // 🔥 Trier les values par date de création
              });
          })
          return{
            categories,
            products
          }
    }

}