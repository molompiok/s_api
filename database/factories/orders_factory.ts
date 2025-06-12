import Factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import UserOrderItem from '#models/user_order_item'
import UserOrder, { OrderStatus, PaymentMethod, PaymentStatus } from '#models/user_order'

export const USER_IDS = [
    '3bbbc28e-b9c5-443f-827d-76049dfeb49c',
    // 'ca230d53-a3e1-43bf-89a9-14e596f977d3',
    // 'dfbbb0cc-15b5-44f9-954d-4356de30c5b9',
    // '57fd53cb-30a8-43a2-90fb-bfab5e10ae1d',
]
export const PRODUCT_ID = '3bbbc28e-b9c5-443f-827d-76049dfeb49c'
function getRandomDateBetween() {

    const start = DateTime.fromISO('2025-01-01') // Date de début
    const end = DateTime.fromISO('2025-04-06')   // Date de fin
    const diffInMillis = end.toMillis() - start.toMillis()
    const randomMillis = start.toMillis() + Math.random() * diffInMillis
    return DateTime.fromMillis(parseInt(randomMillis + ''))
}

export const UserOrderItemFactory = Factory.define(UserOrderItem, ({ faker }) => {
    const date = getRandomDateBetween();
    return {
        id: faker.string.uuid(),
        user_id: faker.helpers.arrayElement(USER_IDS),
        order_id: faker.string.uuid(),
        status: faker.helpers.arrayElement(Object.values(OrderStatus)),
        product_id: PRODUCT_ID,
        bind_name: JSON.stringify(
            {
                "taille:text": {
                    "id": "d18b2bfb-dada-48d1-b873-67f9a4ebf229",
                    "icon": [],
                    "text": "L",
                    "index": 1,
                    "stock": 1,
                    "views": [],
                    "created_at": "2025-04-05T10:40:33.570+00:00",
                    "feature_id": "3e60f581-75e5-46cf-8ae7-3877ff7afd55",
                    "updated_at": "2025-04-05T10:41:14.923+00:00",
                    "decreases_stock": true,
                    "continue_selling": false
                },
                "Les images de chaque variante du produit:icon": {
                    "id": "fcce4930-c6f5-4cc4-a3f4-cdd722f3fdb7",
                    "icon": [
                        "data:image/webp;base64,UklGRnoDAABXRUJQVlA4IG4DAABQEACdASpAAEAAPm0ulEckIiIhKBgMAIANiWkAznt8/ez479F2oj2h4a9/+1zvFMItI0y3+23sC9KZlYGZTaFBQ2T8R58jIsgUaXcsixPAI+6JkO+C+Nnsjpt4R2LT7aOpLJtc55AE3QQjc9cReCWdOnMC6oQq7cE/dIikQUorZO7G4eh+LYX+JiAAAP79wISd83NjYf+mn/6G/Chq5LI1uSHNrv/kDvzLVZIqU+KzCNhk4m7rnhsPF99jOpZX0JTypR1tlXHXy0bbjXL/3cRwsRGZaFiSzaMv2hcDUGh1382XWgsHtPz5li9vusKQa/XAiQdft/jfype/jD5m9V29DSX94vZ5hKNX0Von7q/cKdVLOSu3++zLWy5Jnb9CASPVX1ryP7X//AFAyzVUT0J/PsxX7QuWFpQxfsvsNAXuPeS2aD2T78qC1CTNPxkpt2k6PxDX41rrKA9F5G9BTWb/yqRVMMm/dUPKhkEwDoIs4Hn+pfM5XiMFZLs1SbtiY2xoSKx9VoBhx2et3BPPPG9++aPfM7FN4EzZafZbw0vshBqUlDH66RyOlQNxJ3OggdCl5rc6FM22QxZXl0sBMrlPf8smnUyWT4UvvSVgVpUOGfsE+69//20WKN/pryryxAiSqQAspQCQuSppgbo5yJvf8Ng9DvNxwYXxgb3/7C0Ji0bug2rAvzgEr5xpjON99vnirDm9SSqZDUR09jS0wmi9ncXo82ph6rWq3TkFh2/mp9dzyp6jP60VYv0nKh6N8B/dl9NAwG6JGzzLWF/jvdBHOsL2PxXDeY4yBINOQSDC+QFUeh6npbHUk71ziCk6UndMJSI7epfFES+TlYRxdsKiFY3ksFJ49aNz3d3V3RnAelukK0lHJZPPzlrs5CcTcKdrvHXgfqki86K8mg7Ob/mtZd8WDHeIRtdMeIj8AZgHwJNuCMRJTA3EWjImVqf52QVXGWjIcVOhQcIaur1bHpzvQw1A2lX+7YUUk3QSWcZqTYY6GFuxmB5ISKMJkU+Leigz82+/xH5nxDsyaGK7661cTp89P87L9N8Zue/Ht6Qrgrp3wBgDM7shat8wmQ1Y4/P39halmiGZI03TnTiQDjbnD5YaoD35zwZ4J90FsxJtH9S4ukeCdop45yJWg58Z1Rzo1CBRrJM6o2SALT0AAA=="
                    ],
                    "text": "Fuchsia",
                    "stock": 12,
                    "views": [
                        "/uploads/m941xc08_694h8h8vot8_values_views_fcce4930-c6f5-4cc4-a3f4-cdd722f3fdb7.jpg",
                        "/uploads/m941xc09_dkx1ueu9cx_values_views_fcce4930-c6f5-4cc4-a3f4-cdd722f3fdb7.webp",
                        "/uploads/m941xc05_2xtzpa48ack_values_views_fcce4930-c6f5-4cc4-a3f4-cdd722f3fdb7.webp",
                        "/uploads/m941xc09_nthiiy9zplc_values_views_fcce4930-c6f5-4cc4-a3f4-cdd722f3fdb7.jpg"
                    ],
                    "created_at": "2025-04-05T10:09:10.928+00:00",
                    "feature_id": "76a42c12-f713-4853-b214-53b0db6c6b4c",
                    "updated_at": "2025-04-05T23:58:14.626+00:00",
                    "decreases_stock": false,
                    "continue_selling": false
                },
                "color:color": {
                    "id": "4bb9a5e6-8486-492f-9b40-30dd31b6a7c0",
                    "key": "#9932CC",
                    "icon": [],
                    "text": "Mauve",
                    "index": 1,
                    "stock": 2,
                    "views": [],
                    "created_at": "2025-04-05T10:40:10.441+00:00",
                    "feature_id": "9666fd41-c372-4bc4-a9ee-85919fabd53f",
                    "updated_at": "2025-04-05T10:40:58.682+00:00",
                    "decreases_stock": true,
                    "continue_selling": false
                }
            }
        ),
        bind: JSON.stringify(
            {
                "9666fd41-c372-4bc4-a9ee-85919fabd53f": "aca07120-ae41-4280-a853-7e6f92b80a1a",
                "3e60f581-75e5-46cf-8ae7-3877ff7afd55": "d18b2bfb-dada-48d1-b873-67f9a4ebf229",
                "76a42c12-f713-4853-b214-53b0db6c6b4c": "fcce4930-c6f5-4cc4-a3f4-cdd722f3fdb7"
            }
        ),
        quantity: faker.number.int({ min: 1, max: 5 }),
        price_unit: faker.number.int({ min: 1000, max: 100000 }),
        currency: 'CFA',
        created_at: date,
        updated_at: date,
    } as any
}).build()


// Factory pour UserOrder
export const UserOrderFactory = Factory.define(UserOrder, ({ faker }) => {
    const paymentStatus = faker.helpers.arrayElement(Object.values(PaymentStatus))
    const date = getRandomDateBetween();
    return {
        id: faker.string.uuid(),
        user_id: faker.helpers.arrayElement(USER_IDS),
        phone_number: faker.phone.number(),
        formatted_phone_number: faker.phone.number(),
        country_code: 'CI', // Exemple pour Côte d'Ivoire
        items_count: faker.number.int({ min: 1, max: 5 }),
        reference: faker.string.alphanumeric(10),
        status: faker.helpers.arrayElement(Object.values(OrderStatus)),
        events_status: [{
            change_at: DateTime.fromJSDate(faker.date.past()),
            status: faker.helpers.arrayElement(Object.values(OrderStatus)),
            user_role: faker.helpers.arrayElement(['client', 'admin', 'owner']),
            user_provide_change_id: faker.helpers.arrayElement(USER_IDS),
        }],
        payment_method: faker.helpers.arrayElement(Object.values(PaymentMethod)),
        payment_status: paymentStatus,
        currency: 'CFA',
        total_price: faker.number.int({ min: 1000, max: 5000000 }),
        delivery_price: faker.number.int({ min: 500, max: 20000 }),
        return_delivery_price: 0,
        with_delivery: faker.datatype.boolean(),
        delivery_address: faker.location.streetAddress(),
        delivery_address_name: faker.location.city(),
        delivery_date: DateTime.fromJSDate(faker.date.future()),
        delivery_latitude: faker.location.latitude(),
        delivery_longitude: faker.location.longitude(),
        pickup_address: faker.location.streetAddress(),
        pickup_address_name: faker.location.city(),
        pickup_date: DateTime.fromJSDate(faker.date.future()),
        pickup_latitude: faker.location.latitude(),
        pickup_longitude: faker.location.longitude(),
        created_at: date,
        updated_at: date,
    }
})
    // .relation('items', () => UserOrderItemFactory)
    .build()
