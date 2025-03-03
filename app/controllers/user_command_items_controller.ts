import Cart from '#models/cart'
import Product from '#models/product'
import UserCommandItem from '#models/user_command_item'
import type { HttpContext } from '@adonisjs/core/http'
import { v4 } from 'uuid'

export default class UserCommandItemsController {
  
  public async add_command_item({ request, response, auth }: HttpContext) {
    try {
      const currency = 'CFA'
      const user = await auth.authenticate()
      const stock = 1
      
      const { product_id, quantity, price, views, features } = request.only(['product_id', 'quantity', 'price', 'views', 'features'])

      const product = await Product.find(product_id)
      if (!product) return response.notFound({ message: 'Product not found' })

      const userCommandItem = await UserCommandItem
        .query()
        .where('product_id', product_id)
        .andWhere('user_id', user.id)
        .first()

      if (!userCommandItem) {
        if (quantity <= 0 || stock < quantity) {
          return response.badRequest({ message: 'Stock not enough' })
        }

        const userNewCommandItem = await UserCommandItem.create({
          id: v4(),
          user_id: user.id,
          product_id,
          quantity,
          price_unit: price,
          currency,
          store_id: product.store_id,
          views,
          features: JSON.stringify(features),
        })

        await Cart.create({
          id: v4(),
          user_id: user.id,
          command_item_id: userNewCommandItem.id
        })

        return response.created(userNewCommandItem)
      }

      if (quantity === 0) {
        await Cart.query().where('command_item_id', userCommandItem.id).delete()
        await userCommandItem.delete()
        return response.ok({ isDeleted: true })
      }

      if (quantity > stock) {
        return response.badRequest({ message: 'Stock not enough' })
      }

      userCommandItem.merge({
        quantity,
        price_unit: price,
        currency,
        views,
        features: JSON.stringify(features),
      })
      await userCommandItem.save()

      return response.ok(userCommandItem)

    } catch (error) {
      return response.internalServerError({ message: 'Internal server error', error: error.message })
    }
  }

  public async delete_item_from_command({ request, response }: HttpContext) {
    try {
      const { command_item_id } = request.only(['command_item_id'])
      const commandItem = await UserCommandItem.find(command_item_id)

      if (!commandItem) return response.notFound({ message: 'Item not found in command' })

      await Cart.query().where('command_item_id', command_item_id).delete()
      await commandItem.delete()

      return response.ok({ isDeleted: true })
    } catch (error) {
      return response.internalServerError({ message: 'Internal server error', error: error.message })
    }
  }

  public async delete_all_command_items({ request, response }: HttpContext) {
    try {
      const { user_id } = request.only(['user_id'])

      await Cart.query().where('user_id', user_id).delete()
      await UserCommandItem.query().where('user_id', user_id).delete()

      return response.ok({ isDeleted: true })
    } catch (error) {
      return response.internalServerError({ message: 'Internal server error', error: error.message })
    }
  }

  public async get_user_command_items({ request, response }: HttpContext) {
    try {
      const { user_id, command_id, product_id, store_id, page = 1, limit = 10 } = request.qs()
      
      const pageNum = Math.max(1, parseInt(page))
      const limitNum = Math.max(1, parseInt(limit))

      let query = UserCommandItem.query().select('*')

      if (user_id) query.where('user_id', user_id)
      if (command_id) query.where('command_id', command_id)
      if (product_id) query.where('product_id', product_id)
      if (store_id) query.where('store_id', store_id)

      if (command_id) {
        const command = await query
        return response.ok({ list: command, meta: null })
      }

      const paginatedResults = await query.paginate(pageNum, limitNum)

      return response.ok({ list: paginatedResults.all(), meta: paginatedResults.getMeta() })
    } catch (error) {
      return response.internalServerError({ message: 'Internal server error', error: error.message })
    }
  }

  public async  get_items_by_command({ request, response }: HttpContext) {
    try {
      const { command_id } = request.qs()

      if (!command_id) return response.notFound({ message: "Command ID required" })

      const listItems = await UserCommandItem
        .query()
        .where('command_id', command_id)
        .select('*')

      return response.ok({ list: listItems, meta: null })
    } catch (error) {
      return response.internalServerError({ message: 'Internal server error', error: error.message })
    }
  }
}
