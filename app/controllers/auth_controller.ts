import hash from '@adonisjs/core/services/hash';
import User from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'
import { v4 } from 'uuid';
import { deleteFiles } from './Utils/FileManager/DeleteFiles.js';
import { applyOrderBy } from './Utils/query.js';
import db from '@adonisjs/lucid/services/db';


export default class AuthController {

  async login({ request, response }: HttpContext) {
    try {
      const { email, password } = request.only(['email', 'password'])
      console.log({ email, password });

      let user = null
      try {
        user = await User.findBy('email', email)
      } catch (error) {
        console.log(error, "une erreur");
      }
      if (!user) {
        return response.notFound({ error: 'User not found' })
      }

      const isValid = await hash.verify(user.password, password)
      if (!isValid) {
        return response.unauthorized({ error: 'Invalid password' })
      }

      const token = (await User.accessTokens.create(user)).value?.release()

      return response.ok({ ...User.ParseUser(user), token })
    } catch (error) {
      console.error('Login error:', error)
      return response.internalServerError({ error: 'Bad config or server error' })
    }
  }

   async signup({ request, response }: HttpContext) {
    const { full_name, email, password } = request.only(['full_name', 'email', 'password'])
  
    try {
      const existingUser = await User.findBy('email', email)
      if (existingUser) {
        return response.conflict({ message: 'Email already in use' })
      }

      const user = await User.create({
        id: v4(),
        full_name,
        email,
        photo: [],
        password: password,
      })

      const token = (await User.accessTokens.create(user)).value?.release()

      return response.created({ ...User.ParseUser(user), token })
    } catch (error) {
      console.error('Register error:', error)
      return response.badRequest({ message: 'User not created', error: error.message })
    }
  }
  public async logout({ auth }: HttpContext) {
    const user = await auth.authenticate();
    await User.accessTokens.delete(user, user.currentAccessToken.identifier);
    return {
      disconnection: true
    };
  }
  public async global_logout({ request, auth }: HttpContext) {

    const { user_id } = request.qs()
    const user = await auth.authenticate();
    if (user_id /*&& admin / moderator*/) {
      const tagetUser = await User.find(user_id);
      if (!tagetUser) return 'user not found';
      const tokens = await User.accessTokens.all(tagetUser);
      for (const token of tokens) {
        await User.accessTokens.delete(tagetUser, token.identifier);
      }
    } else {
      const tokens = await User.accessTokens.all(user);
      for (const token of tokens) {
        await User.accessTokens.delete(user, token.identifier);
      }
    }
    return {
      disconnection: true,
    }
  }



  async me({ response, auth }: HttpContext) {
    try {
      const user = await auth.authenticate()
      const token = (await User.accessTokens.create(user)).value?.release()

      return response.ok({ ...User.ParseUser(user), token })
    } catch (error) {
      console.error('Me error:', error)
      return response.unauthorized({ message: 'Not authenticated' })
    }
  }


  async update({ request, response, auth }: HttpContext) {
    try {
      const user = await auth.authenticate()
      const { full_name, password, email } = request.only(['full_name', 'email', 'password'])

      if (full_name) user.full_name = full_name
      if (password) user.password = await hash.make(password)
      if (email) return response.gone({ message: 'Email do not modify' })

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

      await User.accessTokens.delete(user, user.id)

      await user.delete()
      await deleteFiles(user.id)
      return response.ok({ isDelete: user.$isDeleted })
    } catch (error) {
      console.error('Delete account error:', error)
      return response.internalServerError({ message: 'Delete failed', error: error.message })
    }
  }
}

