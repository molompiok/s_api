# s_api/Dockerfile (et potentiellement s_server/Dockerfile)

# ---- Stage 1: Builder ----
# Utiliser une image Node.js LTS récente (ex: Node 20)
FROM node:20-alpine AS builder # <--- CHANGEMENT ICI

# Définir l'environnement de build (peut être development pour avoir plus d'infos,
# mais --production dans `ace build` est ce qui compte pour la sortie)
ENV NODE_ENV=development

WORKDIR /usr/src/app

COPY package*.json ./

# Installer TOUTES les dépendances
RUN npm install

COPY . .

# Builder l'application AdonisJS pour la production
# Le script "build" dans package.json devrait être: "node ace build --production"
# ou "node ace build --ignore-ts-errors --production" si tu choisis d'ignorer les erreurs TS.
RUN npm run build

# ---- Stage 2: Runtime ----
FROM node:20-alpine # <--- CHANGEMENT ICI

ENV NODE_ENV=production
ENV HOST=0.0.0.0
# Le PORT sera défini par une variable d'environnement
# ENV PORT=3334 # Le port par défaut de s_api est 3334 selon ton dernier Dockerfile

WORKDIR /usr/src/app

# Copier les artefacts buildés depuis le stage 'builder'
COPY --from=builder /usr/src/app/build .

USER node

# Le port exposé doit correspondre au PORT que l'application écoute.
# Ton dernier commit a mis 3334 ici, ce qui est bien.
EXPOSE ${PORT:-3334}

CMD ["node", "bin/server.js"]