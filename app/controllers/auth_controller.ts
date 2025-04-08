import hash from '@adonisjs/core/services/hash';
import User from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'
import { v4 } from 'uuid';
import { deleteFiles } from './Utils/media/DeleteFiles.js';
import { GOOGLE_CLIENT_ID } from './Utils/ctrlManager.js';
import { OAuth2Client } from 'google-auth-library';
import UserAuthentification from '#models/user_authentification';
import vine from '@vinejs/vine';
const client = new OAuth2Client(GOOGLE_CLIENT_ID)


export default class AuthController {

  async login({ request, response ,auth }: HttpContext) {
    console.log("🚀 ~ AuthController ~ login ~ response:")
    try {
      const { email, password } = request.only(['email', 'password'])

      try {
        const user = await User.verifyCredentials(email, password)
        await auth.use('web').login(user)
        return response.ok({ user: User.ParseUser(user) })
      } catch {
        return response.unauthorized({ message: 'Email ou mot de passe incorrect' })
      }
    } catch (error) {
      return response.internalServerError({ message: 'Login failed', error: error.message })
    }
  }
  
  async google_auth({ request, auth, response }: HttpContext) {
    const { token } = request.only(['token']) as { token : string }

    if (!token) {
      return response.badRequest({ message: 'Token manquant' })
    }

    try {
      const ticket: any = await client.verifyIdToken({
        audience: GOOGLE_CLIENT_ID,
        idToken: token
      })

      const payload = ticket.getPayload()

      if (!payload) {
        return response.unauthorized({ message: 'Token invalide' })
      }

      const { email, name, sub, picture } = payload
      let user = await User.findBy('email', email)
      if (!user) {
        user = await User.create({
          id : v4(),
          email,
          full_name: name,
          photo: [picture],
          password: sub
        })
      }
      const existingAuth = await UserAuthentification.query()
      .where('user_id', user.id)
      .where('provider', 'google')
      .first()

    if (!existingAuth) {
      await UserAuthentification.create({
        id: v4(),
        user_id: user.id,
        provider: 'google',
        provider_id: sub,
      })
    }
      await auth.use('web').login(user)
      return response.ok({ user : User.ParseUser(user) })
    } catch (error) {
      console.error('Erreur Google Auth:', error)
      return response.internalServerError({ message: 'Erreur d’authentification'  , error})
    }
  }

  public async register_mdp({ request, response, auth }: HttpContext) {
    const userSchema = vine.compile(
      vine.object({
        full_name: vine.string().trim().minLength(3).maxLength(25).optional(),
        email: vine.string().trim().email(),
        password: vine.string().minLength(6),
        photo:vine.string().optional()
      })
    )

    const payload = await request.validateUsing(userSchema)

    try {
      let user = await User.findBy('email', payload.email)

      if (user) {
        const isPasswordValid = await hash.verify(user.password, payload.password)

        if (!isPasswordValid) {
          return response.unauthorized({ message: 'Mot de passe incorrect' })
        }

        await auth.use('web').login(user)

        return response.ok({
          user: User.ParseUser(user),
          message: 'Connexion réussie',
        })
      }

      if (!payload.full_name) {
        return response.unprocessableEntity({
          message: "Veuillez fournir un nom complet pour créer un compte.",
        })
      }

      user = await User.create({
        id: v4(),
        full_name: payload.full_name,
        email: payload.email,
        // photo: [payload.avatarUrl],
        password: payload.password, 
      })

      await UserAuthentification.create({
        id: v4(),
        user_id: user.id,
        provider: 'email',
        provider_id: user.email,
      })

      await auth.use('web').login(user)

      return response.ok({
        user: User.ParseUser(user),
        message: 'Inscription et connexion réussies',
      })
    } catch (error) {
      console.error('Erreur lors de l’inscription/connexion:', error)
      return response.badRequest({
        message: 'Une erreur est survenue',
        error: error.message,
      })
    }
  }
  public async logout({ auth ,response }: HttpContext) {

    await auth.use('web').logout()
    return response.ok({ isDisconnect : true })
 
  }

  async me({ response, auth }: HttpContext) {
    try {
      const isAuthenticated = await auth.use('web').check()
  
      if (!isAuthenticated) {
        return response.unauthorized({ message: 'Non authentifié' })
      }
  
      const user =  auth.use('web').user
  
      if (!user) {
        return response.unauthorized({ message: 'Non authentifié' })
      }
  
      await user.load((loader) => {
        loader
          .load('user_addresses') 
          .load('user_phones')
      })
  
      const userData = {
        ...User.ParseUser(user.$attributes),
        addresses: user.user_addresses.map(address => ({
          id: address.id,
          name: address.name,
          longitude: address.longitude,
          latitude: address.latitude,
          created_at: address.created_at,
          updated_at: address.updated_at
        })),
        phone_numbers: user.user_phones.map(phone => ({
          id: phone.id,
          phone_number: phone.phone_number,
          format: phone.format,
          country_code: phone.country_code,
          created_at: phone.created_at,
          updated_at: phone.updated_at
        }))
      }
  
      return response.ok({ user: userData })
    } catch (error) {
      console.error('Me error:', error)
      return response.unauthorized({ message: 'Non authentifié' })
    }
  }

  async update_user({ request, response, auth }: HttpContext) {
    try {
      const user = await auth.authenticate()
      
      const {
        full_name,
        password,
        email,
        // addresses, // Tableau d'adresses { id?, name, longitude, latitude }
        // phone_numbers // Tableau de numéros { id?, phone_number, format, country_code }
      } = request.only(['full_name', 'email', 'password', 'addresses', 'phone_numbers'])
  
      if (full_name) user.full_name = full_name
      if (password) user.password = await hash.make(password)
      if (email) return response.forbidden({ message: 'Modification de l’email interdite' })
  
      await user.save()
  
      // if (addresses && Array.isArray(addresses) && addresses.length > 0) {
      //   await user.load('addresses')
        
      //   const addressIds = addresses.filter(a => a.id).map(a => a.id)
      //   await UserAddress.query()
      //     .where('user_id', user.id)
      //     .whereNotIn('id', addressIds)
      //     .delete()
  
      //   for (const addressData of addresses) {
      //     if (addressData.id) {
      //       await UserAddress.query()
      //         .where('id', addressData.id)
      //         .where('user_id', user.id)
      //         .update({
      //           name: addressData.name,
      //           longitude: addressData.longitude,
      //           latitude: addressData.latitude
      //         })
      //     } else {
      //       await UserAddress.create({
      //         user_id: user.id,
      //         name: addressData.name,
      //         longitude: addressData.longitude,
      //         latitude: addressData.latitude
      //       })
      //     }
      //   }
      // }
  
      // if (phone_numbers && Array.isArray(phone_numbers)) {
      //   await user.load('phoneNumbers')
        
      //   const phoneIds = phone_numbers.filter(p => p.id).map(p => p.id)
      //   await UserPhone.query()
      //     .where('user_id', user.id)
      //     .whereNotIn('id', phoneIds)
      //     .delete()
  
      //   for (const phoneData of phone_numbers) {
      //     if (phoneData.id) {
      //       await UserPhone.query()
      //         .where('id', phoneData.id)
      //         .where('user_id', user.id)
      //         .update({
      //           phone_number: phoneData.phone_number,
      //           format: phoneData.format,
      //           country_code: phoneData.country_code
      //         })
      //     } else {
      //       await UserPhone.create({
      //         user_id: user.id,
      //         phone_number: phoneData.phone_number,
      //         format: phoneData.format,
      //         country_code: phoneData.country_code
      //       })
      //     }
      //   }
      // }
  
      // await user.load('addresses')
      // await user.load('phoneNumbers')
  
      const userData = {
        ...User.ParseUser(user),
        // addresses: user.user_addresses.map(address => ({
        //   id: address.id,
        //   name: address.name,
        //   longitude: address.longitude,
        //   latitude: address.latitude,
        //   created_at: address.created_at,
        //   updated_at: address.updated_at
        // })),
        // phone_numbers: user.user_phones.map(phone => ({
        //   id: phone.id,
        //   phone_number: phone.phone_number,
        //   format: phone.format,
        //   country_code: phone.country_code,
        //   created_at: phone.created_at,
        //   updated_at: phone.updated_at
        // }))
      }
  
      return response.ok(userData)
    } catch (error) {
      console.error('Update error:', error)
      return response.badRequest({ message: 'Update failed', error: error.message })
    }
  }
  async delete_account({ response, auth }: HttpContext) {
    try {
      const user = await auth.authenticate()
  
      await UserAuthentification.query().where('user_id', user.id).delete()
  
      await user.delete()
  
      await deleteFiles(user.id)
  
      await auth.use('web').logout()
      return response.ok({ message: 'Compte supprimé avec succès' })
    } catch (error) {
      console.error('Erreur suppression de compte:', error)
      return response.internalServerError({ message: 'Échec de la suppression du compte' })
    }
  }
  
}

