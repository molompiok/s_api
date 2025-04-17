// Exemple : s_api/src/worker.ts (ou à intégrer dans le démarrage de s_api)
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis'; // Utiliser ioredis directement ici
import env from '../../start/env.js';

// Récupérer les infos de connexion Redis depuis l'environnement
const redisHost = env.get('REDIS_HOST') || '127.0.0.1';
const redisPort = parseInt(env.get('REDIS_PORT').toString() || '6379', 10);
// const redisPassword = env.get('REDIS_PASSWORD') || undefined;

//@ts-ignore
// const workerConnection = new IORedis(redisPort, redisHost, { /* ... options ... */ });


// Récupérer l'ID du store pour lequel cette instance s_api tourne
const storeId = env.get('STORE_ID');

if (!storeId) {
  console.error('FATAL: STORE_ID environment variable is not set.');
  process.exit(1); // Ne peut pas fonctionner sans storeId
}

const queueName = `server-to-service+${storeId}`; // Nom de la queue à écouter

console.log(`[s_api Worker ${storeId}] Initializing worker for queue: ${queueName}`);

// Créer la connexion Redis dédiée pour BullMQ
//@ts-ignore
const connection = new IORedis(redisPort, redisHost, {
  // password: redisPassword,
  maxRetriesPerRequest: null, // Important pour la robustesse des workers BullMQ
  // enableReadyCheck: false // Peut être nécessaire selon la config Redis/BullMQ
});

const serverQueueName = 'service-to-server+s_server';
const serverQueue = new Queue(serverQueueName, { connection: connection });

connection.on('connect', () => console.log(`[s_api Worker ${storeId}] Redis connection established for BullMQ.`));
connection.on('error', (err:any) => console.error(`[s_api Worker ${storeId}] Redis connection error for BullMQ:`, err));

// Créer le Worker
const worker = new Worker(
  queueName,
  async (job) => {
    console.log(`[s_api Worker ${storeId}] Received job: ${job.id}, Event: ${job.data.event}`);

    // === Logique de traitement des messages ===
    switch (job.data.event) {
      case 'admin_ping':
        console.log(`[s_api Worker ${storeId}] ===> PING reçu ! (Data: ${JSON.stringify(job.data.data)})`);
        try {
          const pongData = {
            storeId: storeId,
            originalMessage: job.data.data, // On renvoie le message d'origine
            timestamp: Date.now()
          };
          await serverQueue.add('admin_pong', // Nom de l'événement de retour
            { event: 'admin_pong', data: pongData }, // Structure cohérente { event, data }
            { jobId: `pong-${job.id}` } // ID unique pour éviter doublon si retry
          );
          console.log(`[s_api Worker ${storeId}] <=== PONG envoyé à ${serverQueueName}.`);
        } catch (error) {
          console.error(`[s_api Worker ${storeId}] Erreur lors de l'envoi du PONG:`, error);
          // Faut-il relancer l'erreur pour faire échouer le job ping ? Probablement pas.
        }
        break;
      // --- Ajouter d'autres 'case' ici pour d'autres événements ---
      // case 'config_update':
      //   console.log(`[s_api Worker ${storeId}] Configuration update received`, job.data.data);
      //   // Appeler une fonction pour recharger la config
      //   break;
      default:
        console.warn(`[s_api Worker ${storeId}] Événement inconnu reçu: ${job.data.event}`);
    }
  },
  {
    connection: connection,
    concurrency: 5 // Nombre de jobs traités en parallèle
  }
);

worker.on('completed', (job) => {
  console.log(`[s_api Worker ${storeId}] Job ${job.id} (${job.data.event}) completed.`);
});

worker.on('failed', (job, err) => {
  console.error(`[s_api Worker ${storeId}] Job ${job?.id} (${job?.data?.event}) failed:`, err);
});

worker.on('error', err => {
    console.error(`[s_api Worker ${storeId}] Worker error:`, err);
});

console.log(`[s_api Worker ${storeId}] Worker started and listening on queue ${queueName}.`);

// Garder le worker actif (si c'est un script séparé)
// process.stdin.resume(); // Ou intégrer dans le cycle de vie de l'app s_api

// Gestion de l'arrêt propre (important !)
const shutdown = async () => {
  console.log(`[s_api Worker ${storeId}] Shutting down worker and queue...`);
  await worker.close();
  await connection.quit(); 
  await serverQueue.close();
  console.log(`[s_api Worker ${storeId}] Worker and queue shut down.`);
};

process.on('SIGTERM', shutdown); // Signal d'arrêt de Docker/Swarm
process.on('SIGINT', shutdown); // Ctrl+C