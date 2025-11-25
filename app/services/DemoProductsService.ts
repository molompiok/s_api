// app/services/DemoProductsService.ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import Categorie from '#models/categorie'
import Product from '#models/product'
import ProductFaq from '#models/product_faq'
import Detail from '#models/detail'
import ProductCharacteristic from '#models/product_characteristic'
import Feature, { FeatureType } from '#models/feature'
import Value from '#models/value'
import logger from '@adonisjs/core/services/logger'
import { getRandomPicsum } from '#database/factories/utils'

interface DemoProductData {
  categories: Array<{
    name: string
    description: string
    is_visible: boolean
    products: Array<{
      name: string
      description: string
      price: number
      barred_price: number | null
      currency: string
      is_visible: boolean
      faqs: Array<{
        title: string
        content: string
        group: string
        index: number
        sources?: Array<{
          label: string
          url: string
        }>
      }>
      details: Array<{
        title: string
        description: string
        type: string
        index: number
      }>
      characteristics: Array<{
        name: string
        description: string
        key: string
        value_text: string
        quantity: number
        unity: string
        level: number
        index: number
      }>
      features: Array<{
        name: string
        type: string
        required: boolean
        is_default: boolean
        index: number
        values: Array<{
          text: string
          key?: string
          stock: number
          additional_price: number
          decreases_stock: boolean
          continue_selling: boolean
          index: number
        }>
      }>
    }>
  }>
}

/**
 * Service pour générer des produits de démonstration
 * Crée 2 catégories avec 3 produits chacune, chaque produit ayant tous les détails
 * Utilise un JSON avec des données cohérentes en français
 */
export class DemoProductsService {
  /**
   * Charge les données depuis le JSON
   */
  private static loadDemoData(): DemoProductData {
    try {
      // Chemin vers le fichier JSON depuis la racine du projet
      const filePath = join(process.cwd(), 'app', 'services', 'demo_products_data.json')
      const fileContent = readFileSync(filePath, 'utf-8')
      return JSON.parse(fileContent) as DemoProductData
    } catch (error) {
      logger.error({ error }, 'Erreur lors du chargement du fichier JSON')
      throw new Error('Impossible de charger les données de démonstration')
    }
  }

  /**
   * Génère des produits de démonstration pour une nouvelle boutique
   * @returns Promise<void>
   */
  static async generateDemoProducts(): Promise<void> {
    logger.info('🚀 Début de la génération des produits de démonstration...')

    try {
      const demoData = this.loadDemoData()
      logger.info(`📋 Données chargées: ${demoData.categories.length} catégories`)

      // Créer les catégories et leurs produits
      for (const categoryData of demoData.categories) {
        logger.info(`📦 Création de la catégorie: ${categoryData.name}`)

        // Créer la catégorie
        const category = await Categorie.create({
          id: uuidv4(),
          name: categoryData.name,
          description: categoryData.description,
          parent_category_id: null,
          is_visible: categoryData.is_visible,
          view: [getRandomPicsum()],
          icon: [getRandomPicsum()],
        })

        logger.info(`✅ Catégorie "${category.name}" créée (ID: ${category.id})`)

        // Créer les produits de cette catégorie
        for (const productData of categoryData.products) {
          logger.info(`🔧 Création du produit: ${productData.name}`)

          const productId = uuidv4()
          const tempDefaultFeatureId = uuidv4() // UUID temporaire pour créer le produit

          // 1. Créer le produit d'abord avec un UUID temporaire pour default_feature_id
          // (nécessaire car features a une FK vers products)
          const product = await Product.create({
            id: productId,
            name: productData.name,
            description: productData.description,
            price: productData.price,
            barred_price: productData.barred_price,
            currency: productData.currency,
            is_visible: productData.is_visible,
            categories_id: [category.id],
            comment_count: 0,
            rating: 0,
            default_feature_id: tempDefaultFeatureId, // Sera mis à jour après création des features
          })

          logger.info(`  ✓ Produit "${product.name}" créé (ID: ${product.id})`)

          // 2. Créer les features/variantes
          let defaultFeatureId: string | null = null
          const features: Feature[] = []

          for (const featureData of productData.features) {
            const feature = await Feature.create({
              id: uuidv4(),
              product_id: product.id,
              name: featureData.name,
              type: featureData.type as FeatureType,
              icon: [getRandomPicsum()],
              required: featureData.required,
              is_default: featureData.is_default,
              default_value: null,
              regex: '.*',
              index: featureData.index,
              min: 0,
              max: 100,
              min_size: 1,
              max_size: 10,
              multiple: false,
              is_double: false,
            })

            features.push(feature)

            if (featureData.is_default) {
              defaultFeatureId = feature.id
            }

            // Créer les values pour cette feature
            for (const valueData of featureData.values) {
              await Value.create({
                id: uuidv4(),
                feature_id: feature.id,
                views: [getRandomPicsum(), getRandomPicsum(), getRandomPicsum()],
                icon: [getRandomPicsum()],
                text: valueData.text,
                key: valueData.key || valueData.text,
                stock: valueData.stock,
                additional_price: valueData.additional_price,
                currency: productData.currency,
                decreases_stock: valueData.decreases_stock,
                continue_selling: valueData.continue_selling,
                index: valueData.index,
              })
            }
            logger.info(`  ✓ Feature "${feature.name}" créée avec ${featureData.values.length} values`)
          }

          // S'assurer qu'on a une feature par défaut
          if (!defaultFeatureId && features.length > 0) {
            const firstFeature = features[0]
            defaultFeatureId = firstFeature.id
            firstFeature.is_default = true
            await firstFeature.save()
            logger.info(`  ✓ Première feature définie comme défaut`)
          }

          // 3. Mettre à jour le produit avec le bon default_feature_id
          if (defaultFeatureId) {
            product.default_feature_id = defaultFeatureId
            await product.save()
            logger.info(`  ✓ Feature par défaut configurée pour le produit`)
          }

          // 3. Créer les FAQs
          for (const faqData of productData.faqs) {
            await ProductFaq.create({
              id: uuidv4(),
              product_id: product.id,
              title: faqData.title,
              content: faqData.content,
              sources: faqData.sources?.length ? faqData.sources : null,
              group: faqData.group,
              index: faqData.index,
            })
          }
          logger.info(`  ✓ ${productData.faqs.length} FAQs créées`)

          // 4. Créer les détails
          for (const detailData of productData.details) {
            await Detail.create({
              id: uuidv4(),
              product_id: product.id,
              title: detailData.title,
              description: detailData.description,
              view: [getRandomPicsum()],
              type: detailData.type,
              index: detailData.index,
            })
          }
          logger.info(`  ✓ ${productData.details.length} détails créés`)

          // 5. Créer les caractéristiques
          for (const charData of productData.characteristics) {
            await ProductCharacteristic.create({
              id: uuidv4(),
              product_id: product.id,
              name: charData.name,
              description: charData.description,
              icon: [getRandomPicsum()],
              key: charData.key,
              value_text: charData.value_text,
              quantity: charData.quantity,
              unity: charData.unity,
              level: charData.level,
              index: charData.index,
            })
          }
          logger.info(`  ✓ ${productData.characteristics.length} caractéristiques créées`)

          logger.info(`✅ Produit "${product.name}" complètement configuré`)
        }
      }

      logger.info('🎉 Génération des produits de démonstration terminée avec succès!')
    } catch (error) {
      logger.error({ error }, '❌ Erreur lors de la génération des produits de démonstration')
      throw error
    }
  }
}

