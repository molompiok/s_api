import factory from '@adonisjs/lucid/factories'
import ProductFaq from '#models/product_faq'
import { DateTime } from 'luxon'

export const ProductFaqFactory = factory
  .define(ProductFaq, async ({ faker }) => {
    return {
      id: faker.string.uuid(),
      product_id: faker.string.uuid(),
      title: faker.commerce.productAdjective(),
      content: faker.lorem.paragraph(),
      sources: Array.from({ length: faker.number.int({ min: 1, max: 3 }) }).map(() => ({
        label: faker.company.name(),
        url: faker.internet.url(),
      })),
      group: faker.helpers.arrayElement(['general', 'technical', 'usage']),
      index: faker.number.int({ min: 0, max: 20 }),
      created_at: DateTime.now(),
      updated_at: DateTime.now(),
    }
  })
  .build();
