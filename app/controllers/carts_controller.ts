import Cart from '#models/cart'
import CartItem from '#models/cart_item'
import GroupProduct from '#models/group_product'
import User from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { Session } from '@adonisjs/session'
import { DateTime } from 'luxon'
import { v4 } from 'uuid'

interface UpdateCartParams {
  group_product_id: string;
  mode: 'increment' | 'decrement' | 'set' | 'clear' | 'max';
  value?: number;
  ignoreStock?: boolean;
}

interface UpdateCartResult {
  cart: Cart;
  updatedItem: CartItem | null;
  total: number;
  action: 'added' | 'updated' | 'removed' | 'unchanged';    // Historique des changements
}


interface RemoveFromCartParams {
  cart_item_id?: string;
  removeAll?: boolean;
}

export default class CartsController {
  private async getCart({ user, session, trx }: { session: Session; user: User | null; trx?: TransactionClientContract }): Promise<Cart | null> {
    if (user) {
      return await Cart.query({ client: trx })
        .where('user_id', user.id)
        .first();
    } else {
      const cartIdFromSession = session.get('cart_id');
      if (cartIdFromSession) {
        return await Cart.query({ client: trx })
          .where('id', cartIdFromSession)
          .whereNull('user_id')
          .first();
      }
    }
    return null;
  }

  private async createCart(user: User | null, session: Session, trx: TransactionClientContract): Promise<Cart> {
    if (user) {
      return await Cart.create({ id: v4(), user_id: user.id }, { client: trx });
    }
    const expiresAt = DateTime.now().plus({ weeks: 2 });
    const cart = await Cart.create({ id: v4(), expires_at: expiresAt }, { client: trx });
    session.put('cart_id', cart.id);
    return cart;
  }

  public async update_cart({ request, auth, response, session }: HttpContext): Promise<void> {
    let user: User | null = null;
    try {
      user = await auth.authenticate();
    } catch (e) {
      // Utilisateur non authentifié
    }

    let { group_product_id, mode, value = 1, ignoreStock = false } = request.body() as UpdateCartParams;


    value = typeof value === 'string' ? parseInt(value, 10) : value
    ignoreStock = Boolean(ignoreStock)

    console.log({ group_product_id, mode, value, ignoreStock })
    if (!group_product_id || !['increment', 'decrement', 'set', 'clear', 'max'].includes(mode)) {
      return response.status(400).json({ message: 'group_product_id et mode (increment, decrement, set, clear, max) requis' });
    }
    if (mode === 'set' && (value === undefined || value < 0 || !Number.isInteger(value))) {
      return response.status(400).json({ message: 'Pour mode "set", value doit être un entier positif' });
    }
    if ((mode === 'increment' || mode === 'decrement') && (!Number.isInteger(value) || value <= 0)) {
      return response.status(400).json({ message: 'Pour increment/decrement, value doit être un entier positif' });
    }

    try {
      const result = await db.transaction(async (trx): Promise<UpdateCartResult> => {
        const groupProduct = await GroupProduct.query({ client: trx })
          .where('id', group_product_id)
          .forUpdate()
          .preload('product')
          .firstOrFail();

        let cart = await this.getCart({ user, session, trx });
        if (!cart) {
          cart = await this.createCart(user, session, trx);
        }

        let cartItem = await CartItem.query({ client: trx })
          .where('cart_id', cart.id)
          .where('group_product_id', group_product_id)
          .first();
        console.log(cartItem?.$attributes)

        let newQuantity: number | null = null;
        let action: UpdateCartResult['action'] = 'unchanged';
        await cart.load('items', (query) =>
          query.preload('group_product', (groupQuery) => groupQuery.preload('product'))
        );
        console.log('Avant mise à jour:', cart.items.map(item => ({ id: item.group_product_id, qty: item.quantity })));
        switch (mode) {
          case 'increment':
            if (!cartItem) {
              newQuantity = value;
              action = 'added';
            } else {
              newQuantity = cartItem.quantity + value;
              action = 'updated';
            }
            break;

          case 'decrement':
            if (!cartItem) {
              throw new Error('Impossible de décrémenter : article non présent');
            }
            newQuantity = cartItem.quantity - value;
            if (newQuantity < 0) {
              throw new Error(`Impossible de réduire en-dessous de 0 (actuel : ${cartItem.quantity})`);
            }
            action = newQuantity === 0 ? 'removed' : 'updated';
            break;

          case 'set':
            if (!cartItem) {
              newQuantity = value;
              action = 'added';
            } else {
              newQuantity = value;
              action = newQuantity === cartItem.quantity ? 'unchanged' : newQuantity === 0 ? 'removed' : 'updated';
            }
            if (newQuantity < 0) {
              throw new Error('La quantité ne peut pas être négative');
            }
            break;

          case 'clear':
            if (cartItem) {
              await cartItem.delete();
              cartItem = null;
              action = 'removed';
            }
            newQuantity = null;
            break;

          case 'max':
            newQuantity = groupProduct.stock;
            if (!cartItem) {
              action = 'added';
            } else {
              action = newQuantity === cartItem.quantity ? 'unchanged' : 'updated';
            }
            break;
        }

        if (newQuantity !== null && !ignoreStock && newQuantity > groupProduct.stock) {
          throw new Error(`Quantité (${newQuantity}) dépasse le stock (${groupProduct.stock})`);
        }


        if (newQuantity === 0 && cartItem) {
          await cartItem.delete();
          cartItem = null;
          action = 'removed';
        } else if (newQuantity !== null) {
          if (cartItem) {
            cartItem.quantity = newQuantity;
            await cartItem.save();
          } else {
            cartItem = await CartItem.create(
              {
                id: v4(),
                cart_id: cart.id,
                group_product_id,
                quantity: newQuantity,
              },
              { client: trx }
            );
          }
        }

        await cart.load('items', (query) =>
          query
            .orderBy('created_at', 'asc')
            .preload('group_product', (groupQuery) => groupQuery.preload('product'))
        )

        return { cart, updatedItem: cartItem, total: cart.getTotal(), action };
      });

      return response.status(200).json({
        message: `Panier mis à jour avec succès (${mode})`,
        cart: result.cart,
        updatedItem: result.updatedItem,
        total: result.total,
        action: result.action,
      });
    } catch (error) {
      console.error('Erreur mise à jour panier:', error);
      return response.status(400).json({
        message: 'Erreur lors de la mise à jour du panier',
        error: error.message,
      });
    }
  }

  public async remove_from_cart({ request, auth, response, session }: HttpContext): Promise<void> {
    let user: User | null = null;
    try {
      user = await auth.authenticate();
    } catch (e) {
      // Utilisateur non authentifié
    }

    const { cart_item_id, removeAll = false } = request.body() as RemoveFromCartParams;

    if (!cart_item_id && !removeAll) {
      return response.status(400).json({ message: 'cart_item_id requis ou removeAll doit être true' });
    }

    try {
      const result = await db.transaction(async (trx) => {
        const cart = await this.getCart({ user, session, trx });
        if (!cart) {
          throw new Error('Panier non trouvé');
        }

        if (removeAll) {
          await CartItem.query({ client: trx })
            .where('cart_id', cart.id)
            .delete();
        } else {
          const cartItem = await CartItem.query({ client: trx })
            .where('id', cart_item_id!)
            .where('cart_id', cart.id)
            .firstOrFail();
          await cartItem.delete();
        }

        await cart.load('items', (query) =>
          query
            .orderBy('created_at', 'asc')
            .preload('group_product', (groupQuery) => groupQuery.preload('product'))
        );

        return { cart, total: cart.getTotal() };
      });

      return response.status(200).json({
        message: 'Suppression réussie',
        cart: result.cart,
        total: result.total,
      });
    } catch (error) {
      console.error('Erreur suppression:', error);
      return response.status(404).json({
        message: 'Erreur lors de la suppression',
        error: error.message,
      });
    }
  }

  public async view_cart({ auth, session, response }: HttpContext): Promise<void> {
    let user: User | null = null;
    try {
      user = await auth.authenticate();
    } catch (e) {
      // Utilisateur non authentifié
    }
    try {
      const cart = await this.getCart({ user, session });
      if (!cart) {
        return response.status(200).json({ cart: { items: [] }, total: 0 });
      }

      await cart.load('items', (query) =>
        query
          .orderBy('created_at', 'asc')
          .preload('group_product', (groupQuery) => groupQuery.preload('product'))
      );

      return response.status(200).json({
        cart,
        total: cart.getTotal(),
      });
    } catch (error) {
      console.error('Erreur lors de la récupération du panier :', error);
      return response.status(500).json({
        message: 'Erreur lors de la récupération du panier',
        error: error.message,
      });
    }
  }

  public async merge_cart_on_login({ auth, session, response }: HttpContext): Promise<void> {
    const user = await auth.authenticate();
    const cartIdFromSession = session.get('cart_id');

    if (!cartIdFromSession) {
      return response.status(200).json({ message: 'Aucun panier temporaire à fusionner' });
    }

    try {
      const result = await db.transaction(async (trx) => {
        const tempCart = await Cart.query({ client: trx })
          .where('id', cartIdFromSession)
          .whereNull('user_id')
          .preload('items', (query) => query.preload('group_product'))
          .first();

        if (!tempCart) {
          return { message: 'Panier temporaire non trouvé', cart: null };
        }

        let userCart = await Cart.query({ client: trx })
          .where('user_id', user.id)
          .preload('items')
          .first();

        if (!userCart) {
          userCart = await Cart.create(
            { id: v4(), user_id: user.id },
            { client: trx }
          );
        }

        for (const tempItem of tempCart.items) {
          let userCartItem = userCart.items?.find(
            (item) => item.group_product_id === tempItem.group_product_id
          );

          const totalQuantity = (userCartItem?.quantity || 0) + tempItem.quantity;
          const newQuantity = Math.min(totalQuantity, tempItem.group_product.stock);

          if (userCartItem) {
            userCartItem.quantity = newQuantity;
            await userCartItem.useTransaction(trx).save();
          } else {
            await CartItem.create(
              {
                id: v4(),
                cart_id: userCart.id,
                group_product_id: tempItem.group_product_id,
                quantity: newQuantity,
              },
              { client: trx }
            );
          }
        }

        await tempCart.delete();
        session.forget('cart_id');

        await userCart.load('items', (query) =>
          query
            .orderBy('created_at', 'asc')
            .preload('group_product', (groupQuery) => groupQuery.preload('product'))
        );
        return { message: 'Panier fusionné avec succès', cart: userCart };
      });

      return response.status(200).json({
        message: result.message,
        cart: result.cart || undefined,
        total: result.cart?.getTotal() || undefined,
      });
    } catch (error) {
      console.error('Erreur lors de la fusion des paniers :', error);
      return response.status(500).json({
        message: 'Erreur lors de la fusion des paniers',
        error: error.message,
      });
    }
  }
}
