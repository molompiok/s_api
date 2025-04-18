// s_api/app/services/BullMQService.ts
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import env from '#start/env'; // Utilise l'import d'AdonisJS si s_api est une app Adonis
// import { inject } from '@adonisjs/core'; // Si utilisation de l'IoC AdonisJS

// --- Importer les futurs services/handlers d'événements ---
// import AdminCommandService from '#services/AdminCommandService' // Exemple
// import ConfigUpdateService from '#services/ConfigUpdateService' // Exemple

// Interface pour les données de job (pour la clarté)
interface JobData<T = any> {
  event: string;
  data: T;
}

// @inject() // Décommenter si tu utilises l'injection de dépendances AdonisJS
class ApiBullMQService {
  private storeId: string;
  private connection: IORedis.Redis | null = null;
  private worker: Worker | null = null;
  private serverToServerQueue: Queue | null = null;
  private isShuttingDown = false;
  private isInitialized = false;

  // Injecter d'autres services si nécessaire (exemple)
  // constructor(
  //   protected adminCommandService: AdminCommandService,
  //   protected configUpdateService: ConfigUpdateService
  // ) {
  constructor() { // Constructeur simple pour l'instant
    this.storeId = env.get('STORE_ID');
    console.log(`[ApiBullMQService ${this.storeId}] Initializing...`);
    this.initializeConnection();
    const shutdown = async () => {
      console.log(`[s_server Worker] Shutting down worker...`);
      await this.worker?.close();
      await this.connection?.quit();
      console.log(`[s_server Worker] Worker shut down.`);
      process.exit(0);
  };
  
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown); 
  }
/**
     * Initialise explicitement le service (connexion, queues).
     * Doit être appelée une fois avant startWorker ou getServerToServerQueue.
     */
public async initialize() {
    if (this.isInitialized) return;
    console.log(`[ApiBullMQService ${this.storeId}] Initializing service explicitly...`);
    await this.initializeConnection();
    this.isInitialized = true;
    console.log(`[ApiBullMQService ${this.storeId}] Service initialized.`);
}
  /**
   * Initialise la connexion Redis et les instances BullMQ.
   * Doit être appelée avant startWorker.
   */
  private async initializeConnection() {
    if (this.connection) return; // Déjà initialisé

    const redisHost = env.get('REDIS_HOST', '127.0.0.1');
    const redisPort = env.get('REDIS_PORT', 6379);
    // const redisPassword = env.get('REDIS_PASSWORD');

    console.log(`[ApiBullMQService ${this.storeId}] Connecting to Redis at ${redisHost}:${redisPort}...`);
    //@ts-ignore
    this.connection = new IORedis(redisPort, redisHost, {
      // password: redisPassword,
      maxRetriesPerRequest: null, // Recommandé pour BullMQ
      // enableReadyCheck: false,
      lazyConnect: false, // Connexion immédiate pour le worker/queue
    });

    if(!this.connection) throw new Error("Failed to create Redis connection. this.connection = null");

    this.connection.on('connect', () => console.log(`[ApiBullMQService ${this.storeId}] Redis connection established.`));
    this.connection.on('error', (err: any) => console.error(`[ApiBullMQService ${this.storeId}] Redis connection error:`, err));

    // Initialiser la queue pour envoyer à s_server
    const serverQueueName = 'service-to-server+s_server';
    this.serverToServerQueue = new Queue(serverQueueName, {
      connection: this.connection.duplicate(), // Connexion séparée pour la queue
      defaultJobOptions: { // Bon endroit pour définir les options par défaut
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: 1000,
      }
    });
    this.serverToServerQueue.on('error', (error) => {
        console.error(`[ApiBullMQService ${this.storeId}] Error on queue ${serverQueueName}:`, error);
    });

    console.log(`[ApiBullMQService ${this.storeId}] Queue '${serverQueueName}' initialized.`);
  }

  /**
   * Démarre le worker BullMQ pour écouter les messages de s_server.
   */
  public async startWorker() {
    if (this.worker) {
      console.warn(`[ApiBullMQService ${this.storeId}] Worker already started.`);
      return this.worker;
    }
    if (this.isShuttingDown) {
       console.warn(`[ApiBullMQService ${this.storeId}] Cannot start worker during shutdown.`);
       return null;
    }

    await this.initializeConnection(); // Assure que la connexion est prête
    if (!this.connection) {
        throw new Error("Failed to initialize Redis connection before starting worker.");
    }

    const queueName = `server-to-service+${this.storeId}`;
    console.log(`[ApiBullMQService ${this.storeId}] Starting worker for queue: ${queueName}`);

    this.worker = new Worker(
      queueName,
      this.processJob.bind(this), // Appelle la méthode de traitement
      {
        connection: this.connection.duplicate(), // Connexion séparée pour le worker
        concurrency: 5,
        // autorun: false // Si on veut démarrer manuellement ? Non, laisser par défaut.
      }
    );

    this.worker.on('completed', (job, _returnValue) => {
      console.log(`[ApiBullMQService ${this.storeId}] Job ${job.id} (${job.data.event}) completed.`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[ApiBullMQService ${this.storeId}] Job ${job?.id} (${job?.data?.event}) failed:`, err.message, err.stack);
      // TODO: Ajouter monitoring (Sentry, etc.)
    });

    this.worker.on('error', err => {
      // Erreur du worker lui-même (pas d'un job spécifique)
      console.error(`[ApiBullMQService ${this.storeId}] Worker error on queue ${queueName}:`, err);
      // Tenter de redémarrer le worker ? Ou attendre une action manuelle ?
    });

     this.worker.on('ready', () => {
        console.log(`[ApiBullMQService ${this.storeId}] Worker ready and listening on queue ${queueName}.`);
    });

    // Optionnel : lancer explicitement si autorun est false
    // await this.worker.run();

    console.log(`[ApiBullMQService ${this.storeId}] Worker started.`);
    return this.worker;
  }

  /**
   * Arrête proprement le worker et ferme les connexions.
   */
  public async stopWorker() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    console.log(`[ApiBullMQService ${this.storeId}] Shutting down...`);

    try {
      await this.worker?.close();
      console.log(`[ApiBullMQService ${this.storeId}] Worker closed.`);
    } catch (error) {
      console.error(`[ApiBullMQService ${this.storeId}] Error closing worker:`, error);
    }

    try {
      await this.serverToServerQueue?.close();
      console.log(`[ApiBullMQService ${this.storeId}] Server-to-server queue closed.`);
    } catch (error) {
      console.error(`[ApiBullMQService ${this.storeId}] Error closing server-to-server queue:`, error);
    }

    try {
      await this.connection?.quit();
      console.log(`[ApiBullMQService ${this.storeId}] Redis connection closed.`);
    } catch (error) {
      console.error(`[ApiBullMQService ${this.storeId}] Error closing Redis connection:`, error);
    }

    this.worker = null;
    this.serverToServerQueue = null;
    this.connection = null;
    console.log(`[ApiBullMQService ${this.storeId}] Shutdown complete.`);
  }

  /**
   * Méthode interne appelée par le worker pour traiter chaque job.
   * Délègue le traitement à des méthodes/services spécifiques.
   */
  private async processJob(job: Job<JobData>) {
    console.log(`[ApiBullMQService ${this.storeId}] Processing job ${job.id}, Event: ${job.data.event}`);

    try {
      switch (job.data.event) {
        case 'admin_ping':
          await this.handleAdminPing(job);
          break;

        // --- Déléguer à d'autres services/méthodes ---
        // case 'config_update':
        //   await this.configUpdateService.handle(job.data.data); // Exemple
        //   break;
        // case 'auth_token_generated':
        //   await AuthEventService.handleToken(job.data.data); // Exemple
        //   break;

        default:
          console.warn(`[ApiBullMQService ${this.storeId}] Unhandled event type: ${job.data.event}`);
      }
    } catch (error) {
       console.error(`[ApiBullMQService ${this.storeId}] Error processing job ${job.id} (event: ${job.data.event}):`, error);
       // Relancer l'erreur pour que BullMQ marque le job comme échoué et le retente potentiellement
       throw error;
    }
  }

  // --- Méthodes "Handler" pour chaque événement ---

  private async handleAdminPing(job: Job<JobData>) {
    console.log(`[ApiBullMQService ${this.storeId}] ---> Handling admin_ping... (Data: ${JSON.stringify(job.data.data)})`);

    if (!this.serverToServerQueue) {
        console.error(`[ApiBullMQService ${this.storeId}] Cannot send PONG: serverToServerQueue is not initialized.`);
        // Faire échouer le job ? Ou juste logguer ?
        throw new Error("Cannot send PONG, queue not available.");
    }

    try {
      const pongData = {
        storeId: this.storeId,
        originalMessage: job.data.data,
        timestamp: Date.now()
      };
      await this.serverToServerQueue.add('admin_pong',
        { event: 'admin_pong', data: pongData },
        { jobId: `pong-${job.id}` }
      );
      console.log(`[ApiBullMQService ${this.storeId}] <--- PONG sent to s_server.`);
    } catch (error) {
      console.error(`[ApiBullMQService ${this.storeId}] Failed to send PONG:`, error);
      // Ici, on ne veut probablement PAS faire échouer le job ping initial
      // juste parce que le pong a échoué.
    }
  }

  public getServerToServerQueue(): Queue {
      if (!this.isInitialized || !this.serverToServerQueue) {
        // Cela ne devrait pas arriver si initializeConnection est bien appelé
        console.error(`[ApiBullMQService ${this.storeId}] Tentative d'accès à serverToServerQueue avant initialisation!`);
        throw new Error("ApiBullMQService or its serverToServerQueue is not initialized.");
    }
    return this.serverToServerQueue;
}
  // --- Ajouter d'autres méthodes handle... ici ---
  // private async handleConfigUpdate(data: any) { ... }

}


const BullMQService = new ApiBullMQService(); // Exporter une instance unique
export default BullMQService;