import Detail from '#models/detail'
import factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import { getRandomPicsum } from './utils.js'

export const DetailFactory = factory
  .define(Detail, async ({ faker }) => {
    return {
      id: faker.string.uuid(),
      product_id: faker.string.uuid(),
      title: faker.commerce.productName(),
      description: faker.lorem.paragraph(),
      view: [getRandomPicsum()],
      index: faker.number.int({ min: 0, max: 10 }),
      type: faker.helpers.arrayElement(['image', 'video', 'manual']),
      created_at: DateTime.now(),
      updated_at: DateTime.now(),
    }
  })
  .build()
