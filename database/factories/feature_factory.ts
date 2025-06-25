// database/factories/feature_factory.ts
import Factory from '@adonisjs/lucid/factories'
import Feature from '#models/feature'
import { FeatureType } from '#models/feature'
import {  ValueFactory } from './value_factory.js'
import { getRandomPicsum } from './utils.js'

export const FeatureFactory = Factory
  .define(Feature, ({ faker }) => {
    const featureTypes = Object.values(FeatureType)
    return {
      id: faker.string.uuid(),
      product_id: faker.string.uuid(),
      name: faker.commerce.productMaterial(),
      type: featureTypes[Math.floor(Math.random() * 4)],
      icon: [getRandomPicsum()],
      required: faker.datatype.boolean(),
      default_value: faker.datatype.boolean() ? faker.word.sample() : null,
      is_default: false,
      regex: '.*',
      index: faker.number.int({ min: 0, max: 10 }),
      min: faker.number.int({ min: 0, max: 50 }),
      max: faker.number.int({ min: 51, max: 100 }),
      min_size: faker.number.int({ min: 1, max: 5 }),
      max_size: faker.number.int({ min: 6, max: 10 }),
      multiple: faker.datatype.boolean(),
      is_double: faker.datatype.boolean(),
    }
  })
  .relation('values', () => ValueFactory)
  .build()