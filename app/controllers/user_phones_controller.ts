import UserPhone from '#models/user_phone'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { v4 } from 'uuid'

export default class UserPhonesController {
  async create_user_phone({ response, request, auth }: HttpContext) {
    const user = await auth.authenticate()
    const { phone_number, format, country_code } = request.only(['phone_number', 'format', 'country_code'])
    const id = v4()

    const trx = await db.transaction() // ✅ Ajout de transaction

    try {
      const user_phone = await UserPhone.create({
        id,
        user_id: user.id,
        phone_number,
        format,
        country_code
      }, { client: trx })

      await trx.commit() // ✅ Commit seulement après succès

      return response.created(user_phone)
    } catch (error) {
      await trx.rollback() // ❌ Correction : rollback en cas d'erreur
      console.error('Erreur lors de la création du numéro de téléphone :', error)
      return response.badRequest({ message: 'User phone not created', error: error.message })
    }
  }

  async get_user_phones({ request, response }: HttpContext) {
    const { user_id, id } = request.qs()

    try {
      // ✅ Correction : Utilisation de `UserPhone.query()` au lieu de `db.from()`
      const query = UserPhone.query()

      if (user_id) query.where('user_id', user_id)
      if (id) query.where('id', id)

      const user_phones = await query

      return response.ok(user_phones)
    } catch (error) {
      console.error('Erreur lors de la récupération des numéros de téléphone :', error)
      return response.badRequest({ message: 'User phones not found', error: error.message })
    }
  }

  async update_user_phone({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()
    const { phone_number, format, country_code, id } = request.only(['phone_number', 'format', 'country_code', 'id'])

    if (!id) {
      return response.badRequest({ message: 'id is required' })
    }

    const trx = await db.transaction() // ✅ Ajout de transaction

    try {
      const user_phone = await UserPhone.find(id, { client: trx })
      if (!user_phone) {
        await trx.rollback()
        return response.notFound({ message: 'User phone not found' })
      }

      if (user_phone.user_id !== user.id) {
        await trx.rollback()
        return response.forbidden({ message: 'Unauthorized: You are not the owner of this user phone' })
      }

      user_phone.merge({ phone_number, format, country_code })
      await user_phone.save()

      await trx.commit() // ✅ Commit après succès

      return response.ok(user_phone)
    } catch (error) {
      await trx.rollback() // ❌ Correction : rollback en cas d'erreur
      console.error('Erreur lors de la mise à jour du numéro de téléphone :', error)
      return response.badRequest({ message: 'User phone not updated', error: error.message })
    }
  }

  async delete_user_phone({ params, response, auth }: HttpContext) {
    try {
      const user = await auth.authenticate()
      const id = params.id

      if (!id) {
        return response.badRequest({ message: 'Id is required' })
      }

      const user_phone = await UserPhone.find(id)
      if (!user_phone) {
        return response.notFound({ message: 'User phone not found' })
      }

      if (user_phone.user_id !== user.id) {
        return response.forbidden({ message: 'Unauthorized: You are not the owner of this user phone' })
      }

      await user_phone.delete()

      return response.noContent()
    } catch (error) {
      console.error('Erreur lors de la suppression du numéro de téléphone :', error)
      return response.internalServerError({ message: 'Error deleting user phone', error: error.message })
    }
  }
}
