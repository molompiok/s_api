// Dans s_api/start/routes.ts
import router from '@adonisjs/core/services/router'
import { Queue } from 'bullmq';
import IORedis from 'ioredis'; // Ou récupérer la connexion/queue globale si tu l'as centralisée

// --- Récupérer la queue d'envoi (similaire au worker) ---
const storeId = process.env.STORE_ID!; // Vital ici aussi
const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
// const redisPassword = process.env.REDIS_PASSWORD;
const serverQueueName = 'service-to-server+s_server';
// Crée une nouvelle connexion/queue juste pour cette route (ou partage si possible)
//@ts-ignore
const routeSendConnection = new IORedis(redisPort, redisHost, { 
    // password: redisPassword, 
    lazyConnect: true 
}); // lazyConnect est bien ici
const serverQueue = new Queue(serverQueueName, { connection: routeSendConnection });
// --- Fin récupération queue ---


router.get('/debug/request-scale-up', async ({ response }) => {
  if (!storeId) {
    return response.internalServerError('STORE_ID not configured in this s_api instance.');
  }

  try {
    console.log(`[s_api Debug Route ${storeId}] Requesting scale UP to s_server...`);
    const scaleData = {
      serviceType: 'api', // Indique que c'est une API qui demande
      serviceId: storeId,   // L'ID du store (qui correspond au service `api_store_{storeId}`)
      reason: 'Manual debug request' // Juste pour info
    };
    await serverQueue.add('request_scale_up', // Nom de l'événement
      { event: 'request_scale_up', data: scaleData },
      { jobId: `scale-up-${storeId}-${Date.now()}` } // JobId unique pour éviter traitement multiple rapide
    );
    console.log(`[s_api Debug Route ${storeId}] Scale UP request sent to ${serverQueueName}.`);
    // Important: Fermer la connexion lazy si elle a été ouverte
    //  await routeSendConnection.quit();
    return response.ok({ message: 'Scale UP request sent.' });
  } catch (error) {
    console.error(`[s_api Debug Route ${storeId}] Error sending scale UP request:`, error);
     // Important: Tenter de fermer la connexion même en cas d'erreur
    //  await routeSendConnection.quit().catch((e:any) => console.error("Error quitting Redis conn on error:", e));
    return response.internalServerError({ message: 'Failed to send scale request.' });
  }
});

// N'oublie pas de gérer la fermeture de la connexion Redis de la queue
// si l'application s_api s'arrête (plus complexe à gérer proprement pour une route).
// Pour un test, c'est acceptable. Pour la prod, la logique d'envoi serait mieux
// placée dans un service ou un singleton gérant la queue.

const shutdown = async () => {
    console.log(`[s_api Worker ${storeId}] Shutting down worker and queue...`);
    // await worker.close();
    await routeSendConnection.quit(); 
    await serverQueue.close();
    console.log(`[s_api Worker ${storeId}] Worker and queue shut down.`);
  };
  
  process.on('SIGTERM', shutdown); // Signal d'arrêt de Docker/Swarm
  process.on('SIGINT', shutdown); // Ctrl+C