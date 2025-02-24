import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import { TypeJsonRole } from './role.js'
import env from '#start/env'
import db from '@adonisjs/lucid/services/db'
import { OWNER_ID, STORE_ID } from '#controllers/Utils/ctrlManager'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password'
})

export default class User extends compose(BaseModel, AuthFinder) {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare full_name: string | null

  @column()
  declare role_type: RoleType

  @column()
  declare email: string

  @column({ serializeAs: null })
  declare password: string

  @column()
  declare photo: string

  @column()
  declare role_id : string


  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  static accessTokens = DbAccessTokensProvider.forModel(User)

  public static ParseUser(user: User['$attributes']) {
    return {
      ...(user.$attributes||user),
      password: undefined,
    } as any as User['$attributes']
  }

  public static async  isOwner(user_id:string, _premision?:Partial<TypeJsonRole>){
    return OWNER_ID === user_id 
  }
  public static async  isCollaborator(user_id:string, _premision?:Partial<TypeJsonRole>) : Promise<Boolean>{
    return (await db.query().from(User.table).select('*').where('user_id', user_id).andWhere('store_id', STORE_ID).andWhere('type', RoleType.COLLABORATOR).limit(1))[0]!!;
  }

  public static async  isClient(user_id:string, _premision?:Partial<TypeJsonRole>): Promise<Boolean>{
    return (await db.query().from(User.table).select('*').where('user_id', user_id).andWhere('store_id', STORE_ID).andWhere('type', RoleType.CLIENT).limit(1))[0]!!;
  }

  public static async isStoreManager(user_id:string, _premision?:Partial<TypeJsonRole>){
    let isOWner = await this.isOwner(user_id, _premision);
    let isCollaborator = await this.isCollaborator(user_id, _premision)
    return isOWner || isCollaborator;
    
  }

}

export enum RoleType {
  COLLABORATOR = 'collaborator',
  CLIENT = 'client',
}