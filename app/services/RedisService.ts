// app/services/RedisService.ts

import Redis, { type Redis as RedisClient } from 'ioredis'
import { Queue, Worker } from 'bullmq'
import { EventEmitter } from 'node:events'
import env from '#start/env'

export type StoreInterface = Partial<{
  id: string;
  user_id: string;
  name: string;
  title?: string; // Peut être null
  description?: string; // Peut être null
  slug: string;
  logo: (string | Blob)[],
  favicon: (string | Blob)[],
  cover_image: (string | Blob)[],
  domain_names?: string[];
  current_theme_id: string;
  current_api_id: string; // Corrigé depuis le modèle
  expire_at: string; // Date ISO string ou null
  disk_storage_limit_gb: number;
  is_active: boolean;
  is_running?: boolean;
  is_seed_applyed?: boolean;
  created_at: string;
  updated_at: string;
  url?: string;
  timezone?: string,
  currency?: string,
}>

class RedisService {
  //@ts-ignore
  client: RedisClient;

  queues: Map<string, Queue> = new Map(); // Pour les queues BullMQ
  workers: Map<string, Worker> = new Map(); // Pour les workers BullMQ
  emitter: EventEmitter = new EventEmitter(); // EventEmitter pour les messages reçus par workers
  // Méthodes pour obtenir les clés de cache standardisées
  // private getStoreNameKey(storeName: string): string { return `store+name:+${storeName}`; }

  private getStoreIdKey(storeId: string): string { return `store+id+${storeId}`; }

  constructor() {
    if (process.argv.join('').includes('/ace')) return
    //@ts-ignore
    this.client = new Redis({
      host: env.get('REDIS_HOST', '127.0.0.1'),
      port: env.get('REDIS_PORT', '6379'),
      // password: env.get('REDIS_PASSWORD'),
      // lazyConnect: true, // Optionnel: connecter seulement quand nécessaire
      maxRetriesPerRequest: null, // Nombre max de tentatives si connexion échoue
      enableReadyCheck: true, // Vérifie si Redis est prêt avant d'envoyer des commandes
    });

    this.setupEventHandlers();

  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      console.log('🔌 Connecté à Redis.');
    });
    this.client.on('ready', () => {
      console.log('✅ Redis prêt.');
    });
    this.client.on('error', (error) => {
      console.error('❌ Erreur de connexion Redis:', error);
      // Gérer les erreurs de connexion persistantes (arrêter l'app? mode dégradé?)
    });
    this.client.on('reconnecting', () => {
      console.log('⏳ Tentative de reconnexion à Redis...');
    });
    this.client.on('close', () => {
      console.log('🚪 Connexion Redis fermée.');
    });
    this.client.on('end', () => {
      console.log('🏁 Connexion Redis terminée définitivement.');
      // Gérer l'arrêt définitif (arrêter l'app?)
    });
  }

  // --- Fonctions Cache ---

  /**
   * Met une valeur en cache. Sérialise automatiquement en JSON.
   * @param key La clé de cache.
   * @param value La valeur à mettre en cache (peut être un objet/tableau).
   * @param ttlSecondes Temps de vie en secondes (optionnel).
   */
  async setCache(key: string, value: any, ttlSecondes?: number): Promise<boolean> {
    try {
      const stringValue = JSON.stringify(value);
      if (ttlSecondes) {
        await this.client.set(key, stringValue, 'EX', ttlSecondes);
      } else {
        await this.client.set(key, stringValue);
      }
      // logs.log(`💾 Cache défini.`); // Peut être trop verbeux
      return true;
    } catch (error) {
      console.log('❌ Erreur setCache Redis', { key }, error);
      return false;
    }
  }

  /**
   * Récupère une valeur du cache. Désérialise automatiquement depuis JSON.
   * @param key La clé de cache.
   * @returns La valeur désérialisée, ou null si non trouvé ou erreur.
   */
  async getCache<T = any>(key: string): Promise<T | null> {
    try {
      const stringValue = await this.client.get(key);
      if (!stringValue) {
        return null;
      }
      return JSON.parse(stringValue) as T;
    } catch (error) {
      // Peut être une erreur JSON.parse ou une erreur Redis
      if (error instanceof SyntaxError) {
        console.log(`⚠️ Valeur non JSON dans le cache pour la clé`, { key }, error);
      } else {
        console.log('❌ Erreur getCache Redis', { key }, error);
      }
      return null;
    }
  }

  /**
   * Supprime une ou plusieurs clés du cache.
   * @param keys La ou les clés à supprimer.
   * @returns Le nombre de clés supprimées.
   */
  async deleteCache(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    try {
      const count = await this.client.del(keys);
      // logs.log(`🗑️ Cache supprimé(s) : ${count}.`);
      return count;
    } catch (error) {
      console.log('❌ Erreur deleteCache Redis', { keys }, error);
      return 0;
    }
  }
  async getStoreCacheById(storeId: string): Promise<StoreInterface | null> {
    return this.getCache<StoreInterface>(this.getStoreIdKey(storeId));
  }
  async getMyStore() {
    return this.getStoreCacheById(env.get('STORE_ID'))
  }
}

const redisService = new RedisService()
export default redisService