
// database/factories/value_factory.ts
import Factory from '@adonisjs/lucid/factories'
import Value from '#models/value'




export const PRODUCT_IMAGES = [
    'https://fakestoreapi.com/img/81fPKd-2AYL._AC_SL1500_.jpg',
    'https://fakestoreapi.com/img/71g2ednj0JL._AC_SY879_.jpg',
    'https://fakestoreapi.com/img/51Y5NI-I5jL._AC_UX679_.jpg',
    'https://fakestoreapi.com/img/61IBBVJvSDL._AC_SY879_.jpg',
    'https://fakestoreapi.com/img/61mtL65D4cL._AC_SX679_.jpg',
    'https://fakestoreapi.com/img/51eg55uWmdL._AC_UX679_.jpg',
    'https://fakestoreapi.com/img/81Zt42ioCgL._AC_SX679_.jpg',
    'https://fakestoreapi.com/img/71li-ujtlUL._AC_UX679_.jpg',
    'https://fakestoreapi.com/img/71HblAHs5xL._AC_UY879_-2.jpg',
    'https://fakestoreapi.com/img/71kWymZ+c+L._AC_UY879_.jpg',
    'https://fakestoreapi.com/img/61U7T1koQqL._AC_SX679_.jpg',
    'https://fakestoreapi.com/img/71YXzeOuslL._AC_UY879_.jpg',
    'https://fakestoreapi.com/img/71z3kpMAYsL._AC_UL640_QL65_ML3_.jpg',
    'https://fakestoreapi.com/img/61pHAEJ4NML._AC_UX679_.jpg',
    "https://cdn.pixabay.com/photo/2016/11/29/09/32/box-1868070_960_720.jpg",
    "https://cdn.pixabay.com/photo/2017/08/06/06/06/wooden-box-2599243_960_720.jpg",
    "https://cdn.pixabay.com/photo/2014/12/21/23/28/box-575856_960_720.png",
    "https://cdn.pixabay.com/photo/2014/12/21/23/28/box-575855_960_720.png",
    "https://cdn.pixabay.com/photo/2014/12/21/23/28/box-575857_960_720.png",
    "https://cdn.pixabay.com/photo/2016/03/31/19/56/box-1299000_960_720.png",
    "https://cdn.pixabay.com/photo/2016/03/31/19/56/box-1299001_960_720.png",
    "https://cdn.pixabay.com/photo/2016/03/31/19/56/box-1299002_960_720.png",
    "https://cdn.pixabay.com/photo/2016/03/31/19/56/box-1299003_960_720.png",
    "https://cdn.pixabay.com/photo/2016/03/31/19/56/box-1299004_960_720.png"
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