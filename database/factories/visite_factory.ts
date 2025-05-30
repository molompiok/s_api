import Factory from '@adonisjs/lucid/factories'
import Visite from '#models/visite'
import { DateTime } from 'luxon'
import { USER_IDS } from './orders_factory.js'



// === Génère entre 1 et 3 IPs différentes par utilisateur
const userIpMap: Record<string, string[]> = {}
USER_IDS.forEach((userId) => {
  const ipCount = Math.floor(Math.random() * 3) + 1
  const ips = Array.from({ length: ipCount }, () => {
    return `192.168.${Math.trunc(Math.random()) * 255}.${Math.trunc(Math.random()) * 255}`
  })
  userIpMap[userId] = [...new Set(ips)]
})

// === Génère une date aléatoire
function getRandomDateBetween() {
  const start = DateTime.fromISO('2025-01-01')
  const end = DateTime.fromISO('2025-04-06')
  const diffInMillis = end.toMillis() - start.toMillis()
  const randomMillis = start.toMillis() + Math.random() * diffInMillis
  return DateTime.fromMillis(parseInt(randomMillis + ''))
// }

// export const VisiteFactory = Factory
//   .define(Visite, async ({ faker }) => {
//     const user_id = faker.helpers.arrayElement(USER_IDS)
//     const ip_address = faker.helpers.arrayElement(userIpMap[user_id])

//     const browserName = faker.helpers.arrayElement(['Chrome', 'Firefox', 'Safari', 'Edge', 'Brave'])
//     const osName = faker.helpers.arrayElement(['Windows', 'macOS', 'Linux', 'Android', 'iOS'])
//     const deviceType = faker.helpers.arrayElement(['desktop', 'mobile', 'tablet'])

//     return {
//       user_id,
//       ip_address,
//       created_at: getRandomDateBetween(),
//       // updated_at: DateTime.now(),
//       is_authenticate: true,
//       browser_name: browserName,
//       browser_version: faker.system.semver(),
//       os_name: osName,
//       os_version: faker.system.semver(),
//       device_type: deviceType,
//       landing_page: faker.helpers.arrayElement([
//         '/home',
//         '/products/1',
//         '/products/2',
//         '/products/22/comments',
//         '/about',
//         '/contact',
//       ]),
//       referrer: faker.helpers.arrayElement([
//         'https://google.com',
//         'https://youtube.com',
//         'https://twitter.com',
//         null,
//         null,
//         null,
//       ]),
//       session_duration: faker.number.int({ min: 10, max: 600 }), // en secondes
//     }
//   })
//@ts-ignore
// .build()
