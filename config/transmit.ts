import { defineConfig } from '@adonisjs/transmit'

export default defineConfig({
  pingInterval: '30s', // Garde la connexion SSE active
  transport: null
})