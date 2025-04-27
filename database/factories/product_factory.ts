// database/factories/product_factory.ts
import Factory from '@adonisjs/lucid/factories'
import Product from '#models/product'
  
let i = 0
export const ProductFactory = Factory
    .define(Product, ({ faker }) => {
        return {
            id: faker.string.uuid(),
            categories_id: [faker.string.uuid(), faker.string.uuid()],
            default_feature_id: faker.string.uuid(),
            name: faker.commerce.productName()+Number(i++).toString(32),
            description: faker.commerce.productDescription(),
            price: faker.number.int({ min: 100, max: 10000 }),
            barred_price: faker.datatype.boolean() ? faker.number.int({ min: 1000, max: 15000 }) : null,
            currency: 'USD',
            is_visible:Math.random()<0.5,
            comment_count: faker.number.int({ min: 0, max: 1000 }),
            rating: faker.number.float({ min: 0, max: 5, fractionDigits: 3 }),
        }
    })
    //   .relation('features', () => FeatureFactory)
    .build()


