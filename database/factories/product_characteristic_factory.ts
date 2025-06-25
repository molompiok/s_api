import ProductCharacteristic from '#models/product_characteristic'
import factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import { getRandomPicsum } from './utils.js'

export const ProductCharacteristicFactory = factory
  .define(ProductCharacteristic, async ({ faker }) => {
    return {
      id: faker.string.uuid(),
      product_id: faker.string.uuid(),
      name: faker.commerce.productMaterial(),
      icon: [getRandomPicsum()],
      description: faker.lorem.sentence(),
      key: faker.database.column(),
      value_text: faker.commerce.productAdjective(),
      quantity: faker.number.int({ min: 1, max: 10 }),
      unity: faker.helpers.arrayElement(['kg', 'cm', 'L', 'unit']),
      level: faker.number.int({ min: 0, max: 5 }),
      index: faker.number.int({ min: 0, max: 10 }),
      created_at: DateTime.now(),
      updated_at: DateTime.now(),
    }
  })
  .build()