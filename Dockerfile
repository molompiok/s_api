# s_api/Dockerfile (et potentiellement s_server/Dockerfile)

# ---- Stage 1: Builder ----
# Utiliser une image Node.js LTS récente (ex: Node 20)
FROM node:20-alpine AS builder

# Définir l'environnement de build
ENV NODE_ENV=development

WORKDIR /usr/src/app

# Copier package.json et package-lock.json (ou pnpm-lock.yaml)
# Si tu utilises pnpm, assure-toi que pnpm-lock.yaml est présent et copié
COPY package.json ./
# Décommente si tu utilises pnpm et as un pnpm-lock.yaml
COPY pnpm-lock.yaml ./

# Installer PNPM si tu l'utilises, sinon commente cette section
# Ou mieux, utilise une image de base qui a déjà pnpm, ou installe-le globalement avant
RUN corepack enable && corepack prepare pnpm@latest --activate

# Installer TOUTES les dépendances (y compris devDependencies pour le build TypeScript)
# Si tu utilises npm:
# RUN npm install
# Si tu utilises pnpm (comme dans ton Dockerfile original):
RUN pnpm install --frozen-lockfile # L'option --frozen-lockfile est bonne pour les CI/builds

# Copier tout le code source de l'application
COPY . .

# Builder l'application AdonisJS pour la production
# Le script "build" dans package.json devrait être: "node ace build --production"
# ou "node ace build --ignore-ts-errors --production"
RUN npm run build
# Si tu utilises pnpm pour les scripts :
# RUN pnpm build

# ---- Stage 2: Runtime ----
# Partir d'une image Node.js alpine légère pour l'exécution
FROM node:20-alpine

ENV NODE_ENV=production
ENV HOST=0.0.0.0
# Le PORT sera défini par une variable d'environnement
# ENV PORT=3334

WORKDIR /usr/src/app

# Copier les artefacts buildés depuis le stage 'builder'
COPY --from=builder /usr/src/app/build .

# Si tu as besoin de node_modules et package.json pour le runtime et que
# `npm run build` ne les a pas mis dans `/usr/src/app/build`
# COPY --from=builder /usr/src/app/node_modules ./node_modules # Après un `pnpm prune --prod` dans le builder serait idéal
# COPY --from=builder /usr/src/app/package.json ./package.json


USER node

EXPOSE ${PORT:-3334}

# Commande pour démarrer l'application s_api en production
CMD ["node", "bin/server.js"]