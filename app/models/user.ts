import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { column, hasMany } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import Role from './role.js'
import type { HasMany } from '@adonisjs/lucid/types/relations';
import hash from '@adonisjs/core/services/hash'
import UserAddress from './user_address.js'
import UserPhone from './user_phone.js'
import BaseModel from './base_model.js';
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password'
})

export default class User  extends compose(BaseModel, AuthFinder)  {

  static accessTokens = DbAccessTokensProvider.forModel(User, {
    // Tu peux personnaliser ici si besoin :
     table: 'auth_access_tokens',
     type: 'api_token', 
     expiresIn: '1 days', 
})
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare full_name: string | null

  @column()
  declare role_type: RoleType

  @column()
  declare email: string

  @column()
  declare locale: string | null
  
  @column()
  declare status: string | null
  
  @column({ serializeAs: null })
  declare password: string

  @column({
    prepare: (value) => JSON.stringify(value),
  })
  declare photo: string[]
  
  @column.dateTime({ autoCreate: false, autoUpdate: false }) // Pas de gestion auto par Lucid
  declare email_verified_at: DateTime | null
  
  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime | null

  @hasMany(() => UserAddress, {
    foreignKey: 'user_id'
  })
  declare user_addresses: HasMany<typeof UserAddress>

  @hasMany(() => UserPhone, {
    foreignKey: 'user_id'
  })
  declare user_phones: HasMany<typeof UserPhone>

  @hasMany(() => Role, {
    foreignKey: 'user_id'
  })
  declare roles :HasMany<typeof Role>

  public static async VerifyUser(email: string, password: string) {
    const user = await User.findByOrFail('email', email)
    if (!(await hash.verify(user.password, password))) {
      throw new Error('Invalid credentials')
    }
    return user
  }
  get isEmailVerified(): boolean {
    // La double négation (!!) convertit une valeur "truthy" (comme un objet DateTime)
    // en true, et une valeur "falsy" (comme null) en false.
    return !!this.email_verified_at;
  }


  // --- Méthodes Statiques/Helpers (comme ParseUser si tu l'as) ---
  static ParseUser(user: User | User['$attributes']): Partial<User['$attributes']> {
      // Ta logique pour parser/sérialiser l'utilisateur pour la réponse API
      // Assure-toi d'inclure 'email_verified_at' ou 'isEmailVerified' si tu veux l'exposer au client
      // return {
      //     id: user.id,
      //     full_name: user.full_name,
      //     email: user.email,
      //     photo: user.photo, // exemple
      //     created_at: user.created_at,
      //     updated_at: user.updated_at,
      //     email_verified_at: user.email_verified_at, // Exposer la date de vérification
      //     is_email_verified: !!user.email_verified_at // Exposer le booléen calculé
      //     // NE PAS inclure 'password'
      // };

      return user.serialize()||user
  }

  public isStoreManager() {
    return (this as any).connection == 'jwt'
  }

}

export enum RoleType {
  COLLABORATOR = 'collaborator',
  CLIENT = 'client',
}