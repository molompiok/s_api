# s_api/Dockerfile

# ---- Stage 1: Builder ----
# Utiliser une image Node.js pour le build (avec Alpine pour la légèreté)
FROM node:18-alpine AS builder

# Définir l'environnement de build
ENV NODE_ENV=development

WORKDIR /usr/src/app

# Copier package.json et package-lock.json (ou yarn.lock)
COPY package*.json ./

# Installer TOUTES les dépendances (y compris devDependencies pour le build TypeScript)
# Si tu utilises npm:
RUN npm install
# Si tu utilises yarn:
# RUN yarn install --frozen-lockfile

# Copier tout le code source de l'application
COPY . .

# Compiler TypeScript en JavaScript.
# Assure-toi que ton tsconfig.json a "outDir": "./build" (ou similaire)
# et que le script "build" dans package.json exécute la compilation.
RUN npm run build
# Pour AdonisJS 6 avec `npm run build`:
# Le script "build" dans package.json est typiquement "node ace build --ignore-ts-errors --production"
# Il compile et copie les assets dans le répertoire ./build

# Optionnel: Pruner les devDependencies après le build pour alléger node_modules
# si tu copies node_modules tel quel dans le stage final.
# Cependant, pour AdonisJS, le build copie souvent les node_modules nécessaires.
# Vérifie le contenu de ton dossier ./build après `npm run build`.
# Si ./build/node_modules existe et est complet, tu n'as pas besoin de copier node_modules séparément.
# Sinon, décommente la ligne suivante pour ne garder que les dépendances de production :
# RUN npm prune --production


# ---- Stage 2: Runtime ----
# Partir d'une image Node.js alpine légère pour l'exécution
FROM node:18-alpine

# Définir l'environnement de production
ENV NODE_ENV=production
ENV HOST=0.0.0.0
# Le PORT sera défini par une variable d'environnement injectée par s_server lors de la création du service Swarm
# ENV PORT=3333 # Valeur par défaut si non fournie, mais s_server devrait le définir

WORKDIR /usr/src/app

# Copier les artefacts buildés depuis le stage 'builder'
# La structure exacte dépend de la sortie de `npm run build` d'AdonisJS 6
COPY --from=builder /usr/src/app/build .
# Si ton build AdonisJS ne copie pas node_modules dans le dossier de build,
# alors copie-les depuis le builder (après un éventuel `npm prune --production`):
# COPY --from=builder /usr/src/app/node_modules ./node_modules
# COPY --from=builder /usr/src/app/package.json ./package.json

# L'utilisateur 'node' est créé par défaut dans les images node officielles.
# Il est préférable de l'utiliser pour des raisons de sécurité.
# Assure-toi que cet utilisateur a les droits sur WORKDIR et les fichiers copiés.
# Les volumes montés par Swarm devront aussi avoir les bonnes permissions.
USER node

# Exposer le port sur lequel l'application s_api écoutera
# Ce port doit correspondre à celui défini par la variable d'env PORT
# et à celui utilisé par s_server pour configurer le service Swarm (internal_port du modèle Api)
EXPOSE 3334

# Commande pour démarrer l'application s_api en production
# Pour AdonisJS 6, c'est généralement `node bin/server.js`
CMD ["node", "bin/server.js"]