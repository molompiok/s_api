import { demoSeedOrchestrator } from '#services/DemoSeedOrchestrator'

async function startDemoSeed() {
  try {
    await demoSeedOrchestrator.runIfNeeded()
  } catch (error) {
    console.error('[DemoSeed] Erreur inattendue lors du seed automatique :', error)
  }
}

startDemoSeed()

