import factory from '@adonisjs/lucid/factories'
import ProductFaq from '#models/product_faq'
import { DateTime } from 'luxon'

export const ProductFaqFactory = factory
  .define(ProductFaq, async ({ faker }) => {
    return {
      id: faker.string.uuid(),
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    }
  })
  .build()