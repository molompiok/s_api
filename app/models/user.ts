import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { TypeJsonRole } from './role.js'
import db from '@adonisjs/lucid/services/db'
import { OWNER_ID, STORE_ID } from '#controllers/Utils/ctrlManager'
import type { HasMany } from '@adonisjs/lucid/types/relations';
import hash from '@adonisjs/core/services/hash'
import UserAddress from './user_address.js'
import UserPhone from './user_phone.js'

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

  @column({
    prepare: (value) => JSON.stringify(value),
  })
  declare photo: string[]

  @column()
  declare role_id: string


  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @hasMany(() => UserAddress, {
    foreignKey: 'user_id'
  })
  declare user_addresses: HasMany<typeof UserAddress>

  @hasMany(() => UserPhone, {
    foreignKey: 'user_id'
  })
  declare user_phones: HasMany<typeof UserPhone>

  public static async VerifyUser(email: string, password: string) {
    const user = await User.findByOrFail('email', email)
    if (!(await hash.verify(user.password, password))) {
      throw new Error('Invalid credentials')
    }
    return user
  }

  public static ParseUser(user: User['$attributes']) {
    return {
      ...(user.$attributes || user),
      password: undefined,
    } as any as User['$attributes']
  }

  public static async isOwner(user_id: string, _premision?: Partial<TypeJsonRole>) {
    return OWNER_ID === user_id
  }
  public static async isCollaborator(user_id: string, _premision?: Partial<TypeJsonRole>): Promise<Boolean> {
    return (await db.query().from(User.table).select('*').where('user_id', user_id).andWhere('store_id', STORE_ID).andWhere('type', RoleType.COLLABORATOR).limit(1))[0]!!;
  }

  public static async isClient(user_id: string, _premision?: Partial<TypeJsonRole>): Promise<Boolean> {
    return (await db.query().from(User.table).select('*').where('user_id', user_id).andWhere('store_id', STORE_ID).andWhere('type', RoleType.CLIENT).limit(1))[0]!!;
  }

  public static async isStoreManager(user_id: string, _premision?: Partial<TypeJsonRole>) {
    let isOWner = await this.isOwner(user_id, _premision);
    let isCollaborator = await this.isCollaborator(user_id, _premision)
    return isOWner || isCollaborator;

  }

}

export enum RoleType {
  COLLABORATOR = 'collaborator',
  CLIENT = 'client',
}