//api/start/StartBullMQWoker.ts
// ... autres imports ...
import BullMQService from '#services/BullMQService'; // Importer l'instance

export async function startBullMQWoker() {
    // --- Initialiser les services critiques ---
    try {
        await BullMQService.initialize(); // Appel explicite !
        await BullMQService.startWorker() // Démarrer le service BullMQ
        console.log("ApiBullMQService initialized successfully.");

        // Maintenant, tu peux démarrer le worker via Ace ou programmatiquement
        // Si tu le lances via Ace, la commande Ace appellera aussi initialize()
        // (il faut juste que le initialize() soit idempotent)

    } catch (error) {
        console.error("FATAL: Failed to initialize ApiBullMQService. Application cannot start.", error);
        process.exit(1);
    }

    // --- Démarrer le serveur HTTP ---
    // await app.start(async () => {
    //   const server = await import('@adonisjs/core/services/server')
    //   return server.listen()
    // })

    // Ou si tu utilises un autre framework/serveur :
    // httpServer.listen(env.get('PORT'), () => { ... });
}
