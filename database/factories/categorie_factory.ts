// database/factories/categorie_factory.ts
import Factory from '@adonisjs/lucid/factories'
import Categorie from '#models/categorie'
import { getRandomPicsum } from './utils.js'
// import { ProductFactory } from './product_factory.js'

let i = 0
export const CategorieFactory = Factory
  .define(Categorie, ({ faker }) => {
    return {
      id: faker.string.uuid(),
      parent_category_id: null, // Peut être modifié via un state si besoin
      name: faker.commerce.department()+Number(i++).toString(32),
      description: faker.lorem.paragraph(),
      is_visible:Math.random()<0.5,
      view:[getRandomPicsum()],
      icon: [getRandomPicsum()],
    }
  })
  .build()
