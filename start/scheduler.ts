// start/scheduler.ts
import cron from 'node-cron'
import Cart from '#models/cart'
import { DateTime } from 'luxon'

export function startScheduler() {
   if (process.argv.join('').includes('/ace')) return
  cron.schedule('0 0 * * *', async () => {
    try {
      await Cart.query()
        .whereNull('user_id')
        .where('expires_at', '<', DateTime.now().toString())
        .delete()
      console.log('Paniers temporaires expirés supprimés')
    } catch (error) {
      console.error('Erreur lors du nettoyage des paniers expirés :', error)
    }
  })

  console.log('Scheduler démarré')
}

startScheduler()