import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import { belongsTo, column } from '@adonisjs/lucid/orm'
import BaseModel from './base_model.js';
import { OWNER_ID } from '#controllers/Utils/ctrlManager'
import User from './user.js';
import {type BelongsTo } from '@adonisjs/lucid/types/relations';

export default class Role extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_id: string

  @column()
  declare filter_client: boolean

  @column()
  declare ban_client: boolean

  @column()
  declare filter_collaborator: boolean

  @column()
  declare ban_collaborator: boolean

  @column()
  declare create_delete_collaborator: boolean

  @column()
  declare manage_interface: boolean

  @column()
  declare filter_product: boolean

  @column()
  declare edit_product: boolean

  @column()
  declare create_delete_product: boolean

  @column()
  declare manage_scene_product: boolean

  @column()
  declare chat_client: boolean

  @column()
  declare filter_command: boolean

  @column()
  declare manage_command: boolean

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  public static async  checkAuthorization(user: User, permission: keyof  TypeJsonRole, response:HttpContext['response']) {
    if (!(await Role.isAuthorized(user.id, permission))) {
      return response.unauthorized({ message: 'Unauthorized: not permitted' })
    }
  }
    @belongsTo(() => User, {
      foreignKey: 'user_id',
    })
    declare user: BelongsTo<typeof User>
  

  public static async isAuthorized(userId: string, permission: keyof TypeJsonRole): Promise<boolean> {
    console.log((userId === OWNER_ID) , userId , OWNER_ID);
    try {
      if (userId === OWNER_ID) {
        
        return true
      }
  
      const userRole = await Role.findBy('user_id', userId)
  
      if (!userRole) {
        return false
      }
  
      return Boolean(userRole[permission])
    } catch (error) {
      console.error('Erreur lors de la vérification des permissions :', error)
      return false
    }
  }
}

export const JsonRole = {
  filter_client: '',
  ban_client: '',
  filter_collaborator: '',
  ban_collaborator: '',
  create_delete_collaborator: '',
  manage_interface: '',
  filter_product: '',
  edit_product: '',
  create_delete_product: '',
  manage_scene_product: '',
  chat_client: '',
  filter_command: '',
  manage_command: '',
} as const 




export type TypeJsonRole = {
  [k in keyof typeof JsonRole]: (typeof JsonRole)[k] extends '' ? boolean : string ;
}