// commands/generate_demo_products.ts
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { DemoProductsService } from '#services/DemoProductsService'

export default class GenerateDemoProducts extends BaseCommand {
  static commandName = 'generate:demo-products'
  static description = 'Génère des produits de démonstration pour une nouvelle boutique (2 catégories avec 3 produits chacune)'

  static options: CommandOptions = {
    startApp: true,
  }

  /**
   * Exécute la commande
   */
  async run() {
    this.logger.info('🚀 Démarrage de la génération des produits de démonstration...')

    try {
      await DemoProductsService.generateDemoProducts()
      this.logger.success('✅ Produits de démonstration générés avec succès!')
      this.exitCode = 0
    } catch (error) {
      this.logger.error('❌ Erreur lors de la génération des produits de démonstration')
      this.logger.error(error)
      this.exitCode = 1
    }
  }
}

