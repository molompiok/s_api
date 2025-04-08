// database/factories/categorie_factory.ts
import Factory from '@adonisjs/lucid/factories'
import Categorie from '#models/categorie'
import { PRODUCT_IMAGES } from './value_factory.js'
// import { ProductFactory } from './product_factory.js'

let i = 0
export const CategorieFactory = Factory
  .define(Categorie, ({ faker }) => {
    return {
      id: faker.string.uuid(),
      parent_category_id: null, // Peut être modifié via un state si besoin
      name: faker.commerce.department()+Number(i++).toString(32),
      description: faker.lorem.paragraph(),
      view:[faker.helpers.arrayElement(PRODUCT_IMAGES)],
      icon: [faker.helpers.arrayElement(PRODUCT_IMAGES)],
    }
  })
  .build()
