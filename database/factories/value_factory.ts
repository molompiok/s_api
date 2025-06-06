
// database/factories/value_factory.ts
import Factory from '@adonisjs/lucid/factories'
import Value from '#models/value'




export const PRODUCT_IMAGES = [
    
]



export const ValueFactory = Factory.define(Value, ({ faker }) => {
    const img = faker.image.urlLoremFlickr({ category: 'product' })
    return {
        id: faker.string.uuid(),
        feature_id: faker.string.uuid(),
        views: [faker.helpers.arrayElement(PRODUCT_IMAGES), faker.helpers.arrayElement(PRODUCT_IMAGES), faker.helpers.arrayElement(PRODUCT_IMAGES), faker.helpers.arrayElement(PRODUCT_IMAGES), faker.helpers.arrayElement(PRODUCT_IMAGES)],
        icon: [img],
        text: faker.commerce.productAdjective(),
        key: faker.color.rgb(),
        stock: faker.number.int({ min: 0, max: 1000 }),
        additional_price: faker.number.int({ min: 0, max: 5000 }),
        currency: 'USD',
        decreases_stock: faker.datatype.boolean(),
        continue_selling: faker.datatype.boolean(),
        index: faker.number.int({ min: 0, max: 10 }),
    }
})
    .build()