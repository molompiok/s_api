//api/start/StartBullMQWoker.ts
import BullMQService from '#services/BullMQService'; // Importer l'instance

export async function startBullMQWoker() {
    
    if(process.argv.join('').includes('/ace')) return
    console.log('startBullMQWoker',{args:process.argv.join('')});
    try {
        await BullMQService.initialize(); // Appel explicite !
        await BullMQService.startWorker() // Démarrer le service BullMQ
        console.log("ApiBullMQService initialized successfully.");

    } catch (error) {
        console.error("FATAL: Failed to initialize ApiBullMQService. Application cannot start.", error);
        process.exit(1);
    }

}

startBullMQWoker();