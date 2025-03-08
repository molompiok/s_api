import hash from '@adonisjs/core/services/hash';
import User from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'
import { v4 } from 'uuid';
import { deleteFiles } from './Utils/FileManager/DeleteFiles.js';
import { GOOGLE_CLIENT_ID } from './Utils/ctrlManager.js';
import { OAuth2Client } from 'google-auth-library';
import UserAuthentification from '#models/user_authentification';
const client = new OAuth2Client(GOOGLE_CLIENT_ID)


export default class AuthController {

  async login({ request, response ,auth }: HttpContext) {
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

      const { email, name, sub } = payload
      let user = await User.findBy('email', email)
      if (!user) {
        user = await User.create({
          id : v4(),
          email,
          full_name: name,
          photo: [],
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

   async register_mdp({ request, response ,auth }: HttpContext) {
    const { full_name, email, password } = request.only(['full_name', 'email', 'password'])
    try {
      let user = await User.findBy('email', email)
      if (!user) {
         user = await User.create({
          id: v4(),
          full_name,
          email,
          photo: [],
          password: await hash.make(password),
        })
      }
      const existingAuth = await UserAuthentification.query()
      .where('user_id', user.id)
      .where('provider', 'email')
      .first()
      if (!existingAuth) {
        await UserAuthentification.create({
          id: v4(),
          user_id: user.id,
          provider: 'email',
          provider_id: user.email,
        })
      }

      await auth.use('web').login(user)
      return response.redirect('/')

    } catch (error) {
      console.error('Register error:', error)
      return response.badRequest({ message: 'User not created', error: error.message })
    }
  }
  
  public async logout({ auth ,response }: HttpContext) {

    await auth.use('web').logout()
    return response.redirect('/')
 
  }

  async me({ response, auth }: HttpContext) {
    try {
      const isAuthenticated = await auth.use('web').check()
  
      if (!isAuthenticated) {
        return response.unauthorized({ message: 'Non authentifié' })
      }
  
      const user = auth.use('web').user
      if (!user) {
        return response.unauthorized({ message: 'Non authentifié' })
      }
  
      return response.ok({ user: User.ParseUser(user.$attributes) })
    } catch (error) {
      console.error('Me error:', error)
      return response.unauthorized({ message: 'Non authentifié' })
    }
  }


  async update({ request, response, auth }: HttpContext) {
    try {
      const user = await auth.authenticate()
      const { full_name, password, email } = request.only(['full_name', 'email', 'password'])

      if (full_name) user.full_name = full_name
      if (password) user.password = await hash.make(password)
      if (email) return response.forbidden({ message: 'Modification de l’email interdite' })

      await user.save()

      return response.ok(User.ParseUser(user))
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

