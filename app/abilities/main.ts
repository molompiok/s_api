// app/abilities/main.ts

import User from '#models/user'
import Role, { TypeJsonRole } from '#models/role' // Assure-toi que TypeJsonRole est exporté depuis role.ts
import env from '#start/env'
import { Bouncer } from '@adonisjs/bouncer'
import logger from '@adonisjs/core/services/logger' // Optionnel: pour le logging

const OWNER_ID = env.get('OWNER_ID')

export const superAdmin =  Bouncer.ability(
  async (
    user: User | null
  ) => {
    return ['sublymus@gmail.com','sablymus@gmail.com'].includes(user?.email||'');// TODO
  })
export const collaboratorAbility = Bouncer.ability(
  async (
    user: User | null, // L'utilisateur authentifié (peut être null si non connecté)
    requiredPermissions: (keyof TypeJsonRole)[] // Tableau des permissions requises
  ) => {
    // 1. Vérifier si un utilisateur est authentifié
    if (!user) {
      logger.warn('Bouncer check "collaborator": No authenticated user.')
      return false // Pas d'utilisateur, pas d'accès
    }

    // 2. Vérifier si l'utilisateur est le propriétaire
    if (user.id === OWNER_ID) {
      logger.debug(`Bouncer check "collaborator": User ${user.id} is OWNER. Access granted.`)
      return true // Le propriétaire a toutes les permissions
    }

    // 3. Si ce n'est pas le propriétaire, chercher son rôle de collaborateur
    logger.debug(`Bouncer check "collaborator": User ${user.id} is not owner. Checking role...`)
    const role = await Role.findBy('user_id', user.id)

    // 4. Si l'utilisateur n'a pas d'entrée dans la table Role, il n'est pas collaborateur
    if (!role) {
      logger.warn(`Bouncer check "collaborator": No role found for user ${user.id}. Access denied.`)
      return false
    }

    // 5. Vérifier si le collaborateur possède TOUTES les permissions requises
    for (const perm of requiredPermissions) {
      if (!role[perm]) {
        // Si une seule permission requise est manquante (false), refuser l'accès
        logger.warn(`Bouncer check "collaborator": User ${user.id} missing permission "${perm}". Access denied.`)
        return false
      }
    }

    // 6. Si la boucle se termine, toutes les permissions requises sont présentes
    logger.debug(`Bouncer check "collaborator": User ${user.id} has all required permissions [${requiredPermissions.join(', ')}]. Access granted.`)
    return true
  }
)

// Tu peux définir d'autres abilities ici si nécessaire
// export const viewAdminDashboard = Bouncer.ability(...)