import Role from '#models/role'
import User, { RoleType } from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'
import { v4 } from 'uuid'
import db from '@adonisjs/lucid/services/db'

export default class RolesController {


  public async create_collaborator({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()

    const { user_id } = request.only(['user_id'])
    const trx = await db.transaction()
    try {
      await Role.checkAuthorization(user, 'create_delete_collaborator', response)

      const existUser = await User.find(user_id, { client: trx })
      if (!existUser) {
        await trx.rollback()
        return response.notFound({ message: 'User not found' })
      }

      const roleId = v4()
      existUser.merge({ role_id: roleId, role_type: RoleType.COLLABORATOR })
      await existUser.useTransaction(trx).save()

      const role = await Role.create({
        id: roleId,
        user_id: user_id,
        chat_client: true,
        filter_client: true,
        filter_command: true,
      }, { client: trx })

      await trx.commit()
      return response.created(role)
    } catch (error) {
      await trx.rollback()
      return response.internalServerError({ message: 'Internal server error', error: error.message })
    }
  }

  public async add_remove_permission({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const { user_id, permission, value } = request.only(['user_id', 'permission', 'value'])

    try {
      if (!(await Role.isAuthorized(user.id, 'create_delete_collaborator'))) {
        return response.unauthorized({ message: 'Unauthorized: not permitted' })
      }

      const userRole = await Role.findBy('user_id', user_id)
      if (!userRole) {
        return response.notFound({ message: 'Role not found' })
      }

      userRole.merge({ [permission]: value })
      await userRole.save()

      return response.ok(userRole)
    } catch (error) {
      return response.internalServerError({ message: 'Internal server error', error: error.message })
    }
  }

  public async list_role({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const { user_id } = request.only(['user_id'])

    try {
      if (!(await Role.isAuthorized(user.id, 'filter_collaborator'))) {
        return response.unauthorized({ message: 'Unauthorized: not permitted' })
      }

      const collaboratorRole = await Role.findBy('user_id', user_id)
      if (!collaboratorRole) {
        return response.notFound({ message: 'Role not found' })
      }

      return response.ok({ collaboratorRole })
    } catch (error) {
      return response.internalServerError({ message: 'Internal server error', error: error.message })
    }
  }

  public async remove_collaborator({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const { id } = request.params()
  
    const trx = await db.transaction()
    try {
      await Role.checkAuthorization(user, 'create_delete_collaborator', response)
  
      const userToUpdate = await User.find(id, { client: trx })
      if (!userToUpdate) {
        await trx.rollback()
        return response.notFound({ message: 'User not found' })
      }
  
      const collaboratorRole = await Role.findBy('user_id', id, { client: trx })
      if (!collaboratorRole) {
        await trx.rollback()
        return response.notFound({ message: 'Role not found' })
      }
  
      userToUpdate.merge({ role_id: null, role_type: RoleType.CLIENT })
      await userToUpdate.useTransaction(trx).save()
      await collaboratorRole.useTransaction(trx).delete()
  
      await trx.commit()
      return response.ok({ isDeleted: true })
    } catch (error) {
      await trx.rollback()
      return response.internalServerError({ message: 'Internal server error', error: error.message })
    }
  }
}
