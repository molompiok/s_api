import factory from '@adonisjs/lucid/factories'
import ProductCharacteristic from '#models/product_characteristic'
import { DateTime } from 'luxon'

export const ProductCharacteristicFactory = factory
  .define(ProductCharacteristic, async ({ faker }) => {
    return {
      id:faker.string.uuid(),
      createdAt:DateTime.now(),
      updatedAt:DateTime.now(),
    }
  })
  .build()