import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { CategorieFactory } from '#database/factories/categorie_factory'
import { ProductFactory } from '#database/factories/product_factory'
import { FeatureFactory } from '#database/factories/feature_factory'
import { ValueFactory } from '#database/factories/value_factory'
import { FeatureType } from '#models/feature'
import { ProductFaqFactory } from '#database/factories/product_faq_factory'
import { DetailFactory } from '#database/factories/detail_factory'
import { ProductCharacteristicFactory } from '#database/factories/product_characteristic_factory'
export default class extends BaseSeeder {
  async run() {



    /*******************   CATEGORY    **************************/
    const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
    const categories = await CategorieFactory
      .createMany(5)

    for (const category of categories) {
      // Créer 5 sous-catégories pour chaque catégorie principale
      const subCategories = await CategorieFactory
        .merge({ parent_category_id: category.id })
        .createMany(5);

      for (const subCategory of subCategories) {
        // Créer 5 produits liés à la sous-catégorie et à la catégorie principale
        const products = await ProductFactory
          .merge({ categories_id: [subCategory.id, category.id] })
          .createMany(5)

        for (const product of products) {
          await ProductFaqFactory
            .merge({ product_id: product.id })
            .createMany( randomInt(3, 6) )
          
          await DetailFactory
            .merge({ product_id: product.id })
            .createMany( randomInt(3, 6) )
          
          await ProductCharacteristicFactory
            .merge({ product_id: product.id })
            .createMany( randomInt(3, 6) )
          
          // Créer entre 2 et 3 features pour chaque produit
          const featureCount = randomInt(3, 5) 
          const features = await FeatureFactory
            .merge({ product_id: product.id })
            .createMany(featureCount)

          // Mettre la première feature comme défaut avec type ICON
          const defaultFeature = features[0]
          defaultFeature.is_default = true
          defaultFeature.type = FeatureType.ICON_TEXT
          await defaultFeature.save()

          // Mettre à jour le produit avec le default_feature_id
          product.default_feature_id = defaultFeature.id
          await product.save()

          // Créer entre 3 et 5 values pour chaque feature
          for (const feature of features) {
            const valueCount = randomInt(3, 5)
            await ValueFactory
              .merge({ feature_id: feature.id }) // Correction : un seul objet      
              .createMany(valueCount)
          }
        }
      }
    }

    /********************   VISITE    **************************/
    // await VisiteFactory.createMany(300)

    /*******************   USER_ORDER_ITEM    **************************/
    // const orders = await UserOrderFactory
    //   .with('items', Math.trunc(Math.random()*5)+1) // Nombre aléatoire d'items
    //   .createMany(300);

    // console.log(`✅ ${orders.length} commandes créées avec succès`)

    // orders.forEach((order, index) => {
    //   console.log(`Commande ${index + 1} - ID: ${order.id}, Items: ${order.items_count}`)
    //   order.items.forEach((item, itemIndex) => {
    //     console.log(`  Item ${itemIndex + 1} - Order ID: ${item.order_id}`)
    //   })
    // })


  }
}