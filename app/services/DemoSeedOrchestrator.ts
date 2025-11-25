import { randomUUID } from 'node:crypto'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import redisService from './RedisService.js'
import BullMQService from './BullMQService.js'
import Product from '#models/product'
import Categorie from '#models/categorie'
import UserOrder from '#models/user_order'
import { DemoProductsService } from '#services/DemoProductsService'

const LOCK_TTL_SECONDS = 5 * 60 // 5 minutes

class DemoSeedOrchestrator {
  private isRunning = false

  async runIfNeeded() {
    if (this.isRunning) return
    if (process.argv.join('').includes('/ace')) return

    const autoSeed = env.get('AUTO_DEMO_SEED', 'true')
    if (autoSeed !== 'true') {
      logger.info('[DemoSeed] AUTO_DEMO_SEED désactivé, skip.')
      return
    }

    const storeId = env.get('STORE_ID')
    if (!storeId) {
      logger.warn('[DemoSeed] STORE_ID manquant, impossible de déterminer la boutique.')
      return
    }

    const redisClient = redisService.client
    if (!redisClient) {
      logger.warn('[DemoSeed] Redis non initialisé, annulation.')
      return
    }

    const store = await redisService.getMyStore()
    if (!store) {
      logger.warn('[DemoSeed] Impossible de récupérer les infos du store dans Redis.')
      return
    }

    if (store.is_seed_applyed) {
      logger.info('[DemoSeed] Les produits de démonstration ont déjà été ajoutés, skip.')
      return
    }

    const hasData = await this.hasExistingData()
    if (hasData) {
      logger.info('[DemoSeed] Données déjà présentes, annulation du seed automatique.')
      return
    }

    const lockKey = this.getLockKey(storeId)
    const lockValue = randomUUID()
    //@ts-ignore
    const lockAcquired = await redisClient.set(lockKey, lockValue, 'NX', 'EX', LOCK_TTL_SECONDS)

    if (lockAcquired !== 'OK') {
      logger.info('[DemoSeed] Un autre replica est déjà en train de générer les données.')
      return
    }

    this.isRunning = true
    try {
      logger.info('[DemoSeed] Aucun seed détecté, lancement de la génération de données.')
      await DemoProductsService.generateDemoProducts()
      await this.notifyServerSeedApplied(storeId)
    } catch (error) {
      logger.error({ err: error }, '[DemoSeed] Échec lors de la génération automatiques des données de démo.')
      throw error
    } finally {
      this.isRunning = false
      await this.releaseLock(lockKey, lockValue, redisClient)
    }
  }

  private async hasExistingData() {
    const [productCount, categoryCount, orderCount] = await Promise.all([
      this.countRecords(Product),
      this.countRecords(Categorie),
      this.countRecords(UserOrder),
    ])

    return productCount > 0 || categoryCount > 0 || orderCount > 0
  }

  private async countRecords(model: typeof Product | typeof Categorie | typeof UserOrder) {
    const result = await model.query().count('* as total')
    const total = Number(result[0]?.$extras?.total || 0)
    return total
  }

  private getLockKey(storeId: string) {
    return `store:${storeId}:demo_seed:on_apply`
  }

  private async releaseLock(lockKey: string, lockValue: string, redisClient: typeof redisService.client) {
    try {
      const currentValue = await redisClient?.get(lockKey)
      if (currentValue === lockValue) {
        await redisClient?.del(lockKey)
      }
    } catch (error) {
      logger.error({ err: error }, '[DemoSeed] Impossible de libérer le verrou Redis.')
    }
  }

  private async notifyServerSeedApplied(storeId: string) {
    try {
      await BullMQService.initialize()
      const queue = BullMQService.getServerToServerQueue()
      await queue.add('update_store_seed_flag', {
        event: 'server_action',
        data: {
          server_action: 'updateStoreSeedFlag',
          store_id: storeId,
          is_seed_applyed: true,
        },
      })
      logger.info('[DemoSeed] Notification envoyée à s_server pour mise à jour du flag.')
    } catch (error) {
      logger.error({ err: error }, '[DemoSeed] Impossible d\'envoyer la notification server_action.')
      throw error
    }
  }
}

export const demoSeedOrchestrator = new DemoSeedOrchestrator()

