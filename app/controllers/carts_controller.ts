import Cart from '#models/cart'
import CartItem from '#models/cart_item'
import GroupProduct from '#models/group_product'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { v4 } from 'uuid'

export default class CartsController {

    public async add_to_cart({ request, auth, response }: HttpContext) {
        const user = await auth.authenticate()
        const { group_product_id, quantity } = request.body()
        try {
          const groupProduct = await GroupProduct.query()
            .where('id', group_product_id)
            .preload('product')
            .firstOrFail()
    
          if (groupProduct.stock < quantity) {
            return response.status(400).json({
              message: `Stock insuffisant pour ${groupProduct.id}. Disponible : ${groupProduct.stock}, demandé : ${quantity}`,
            })
          }
    
          const result = await db.transaction(async (trx) => {
            let cart = await Cart.query({ client: trx })
              .where('user_id', user.id)
              .first()
    
            if (!cart) {
              cart = await Cart.create(
                {
                  id: v4(),
                  user_id: user.id,
                },
                { client: trx }
              )
            }
    
            let cartItem = await CartItem.query({ client: trx })
              .where('cart_id', cart.id)
              .where('group_product_id', group_product_id)
              .first()
    
            if (cartItem) {
              const newQuantity = cartItem.quantity + quantity
              if (newQuantity > groupProduct.stock) {
                throw new Error(
                  `Quantité totale (${newQuantity}) dépasse le stock disponible (${groupProduct.stock})`
                )
              }
              cartItem.quantity = newQuantity
              await cartItem.save()
            } else {
              cartItem = await CartItem.create(
                {
                  id: v4(),
                  cart_id: cart.id,
                  group_product_id: group_product_id,
                  quantity: quantity,
                },
                { client: trx }
              )
            }
    
            await cart.load('items', (query) => {
              query.preload('group_product', (groupQuery) => groupQuery.preload('product'))
            })
    
            const total = cart.items.reduce((sum, item) => {
              const itemPrice = (item.group_product.additional_price || 0) + (item.group_product.product?.price || 0)
              return sum + item.quantity * itemPrice
            }, 0)
    
            return { cart, cartItem, total }
          })
    
          return response.status(200).json({
            message: 'Produit ajouté au panier avec succès',
            cart: result.cart,
            addedItem: result.cartItem,
            total: result.total,
          })
        } catch (error) {
          console.error('Erreur lors de l’ajout au panier :', error)
          return response.status(500).json({
            message: 'Erreur lors de l’ajout au panier',
            error: error.message,
          })
        }
      }
    
      public async remove_from_cart({ request, auth, response }: HttpContext) {
        const user = await auth.authenticate()
        const { cart_item_id } =  request.body()
    
        try {
          const result = await db.transaction(async (trx) => {
            const cart = await Cart.query({ client: trx })
              .where('user_id', user.id)
              .firstOrFail()
    
            const cartItem = await CartItem.query({ client: trx })
              .where('id', cart_item_id)
              .where('cart_id', cart.id)
              .firstOrFail()
    
            await cartItem.delete()
    
            await cart.load('items', (query) => {
              query.preload('group_product', (groupQuery) => groupQuery.preload('product'))
            })
    
            const total = cart.items.reduce((sum, item) => {
              const itemPrice = (item.group_product.additional_price || 0) + (item.group_product.product?.price || 0)
              return sum + item.quantity * itemPrice
            }, 0)
    
            return { cart, total }
          })
    
          return response.status(200).json({
            message: 'Article supprimé du panier avec succès',
            cart: result.cart,
            total: result.total,
          })
        } catch (error) {
          console.error('Erreur lors de la suppression du panier :', error)
          return response.status(404).json({
            message: 'Erreur lors de la suppression de l’article',
            error: error.message,
          })
        }
      }
    
      public async view_cart({ auth, response }: HttpContext) {
        const user = await auth.authenticate()
        try {
          const cart = await Cart.query()
            .where('user_id', user.id)
            .preload('items', (query) => {
              query.preload('group_product', (groupQuery) => groupQuery.preload('product'))
            })
            .first()
          if (!cart) {
            return response.status(404).json({ message: 'Panier non trouvé' })
          }
          const total = cart.items.reduce((sum, item) => {
            const itemPrice = (item.group_product.additional_price || 0) + (item.group_product.product?.price || 0)
            return sum + item.quantity * itemPrice
          }, 0)
          return response.status(200).json({
            cart,
            total,
          })
        } catch (error) {
          console.error('Erreur lors de la récupération du panier :', error)
          return response.status(500).json({
            message: 'Erreur lors de la récupération du panier',
            error: error.message,
          })
        }}
}