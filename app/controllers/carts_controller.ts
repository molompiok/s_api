import Cart from '#models/cart'
import CartItem from '#models/cart_item'
import Product from '#models/product'
import User from '#models/user'
import { UpdateCartMessage, updateCartValidator } from '#validators/CartValidator'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { Session } from '@adonisjs/session'
import { errors } from '@vinejs/vine'
import { DateTime } from 'luxon'
import { v4 } from 'uuid'



interface UpdateCartResult {
  cart: Cart;
  updatedItem: CartItem | null;
  total: number;
  action: 'added' | 'updated' | 'removed' | 'unchanged';
}
interface UpdateCartParams {
  product_id: string;
  mode: 'increment' | 'decrement' | 'set' | 'clear' | 'max';
  value?: number;
  bind?: Record<string, any>;
  ignoreStock?: boolean;
}


export default class CartsController {
  private async getCart({ user, session, trx }: { session: Session; user: User | null; trx?: TransactionClientContract }): Promise<Cart | null> {
    let query = Cart.query({ client: trx });

    if (user) {
      query = query.where('user_id', user.id);
    } else {
      const cartIdFromSession = session.get('cart_id');
      if (cartIdFromSession) {
        query = query.where('id', cartIdFromSession).whereNull('user_id');
      } else {
        return null;
      }
    }
    return await query.first();
  }

  private async createCart(user: User | null, session: Session, trx: TransactionClientContract): Promise<Cart> {
    const cartData: Partial<Cart> = { id: v4() };

    if (user) {
      cartData.user_id = user.id;
    } else {
      cartData.expires_at = DateTime.now().plus({ weeks: 2 });
    }

    const cart = await Cart.create(cartData, { client: trx });

    if (!user) {
      session.put('cart_id', cart.id);
    }

    return cart;
  }
  public async update_cart({ request, auth, response, session }: HttpContext): Promise<void> {
    let user: User | null = null;
    try {
      user = await auth.authenticate();
    } catch (e) {
      // Utilisateur non authentifié
    }

    let { product_id, mode, value = 1, ignoreStock = false , bind = {} } = request.body() as UpdateCartParams;


    value = typeof value === 'string' ? parseInt(value, 10) : value
    ignoreStock = Boolean(ignoreStock)
    if (typeof bind !== 'object' || bind === null) {
      return response.status(400).json({ message: 'Le paramètre bind doit être un objet' });
    }
    console.log({ product_id, mode, value, bind , ignoreStock })
    if (!product_id || !['increment', 'decrement', 'set', 'clear', 'max'].includes(mode)) {
      return response.status(400).json({ message: 'product_id et mode (increment, decrement, set, clear, max) requis' });
    }
    if (mode === 'set' && (value === undefined || value < 0 || !Number.isInteger(value))) {
      return response.status(400).json({ message: 'Pour mode "set", value doit être un entier positif' });
    }
    if ((mode === 'increment' || mode === 'decrement') && (!Number.isInteger(value) || value <= 0)) {
      return response.status(400).json({ message: 'Pour increment/decrement, value doit être un entier positif' });
    }

    const trx = await db.transaction();

    try {
      const product = await Product.find(product_id, { client: trx });
      if (!product) {
        return response.notFound({ message: 'Product Not Found' });
      }
      
      let cart = await this.getCart({ user, session, trx });
      if (!cart) {
        cart = await this.createCart(user, session, trx);
      }

      let cartItem = await CartItem.query({ client: trx })
        .forUpdate()
        .where('cart_id', cart.id)
        .where('product_id', product_id) 
        .preload('product') 
        .whereRaw('bind::jsonb = ?', [JSON.stringify(bind)])
        .first();

      let newQuantity: number | null | undefined = undefined  ;
      let action: UpdateCartResult['action'] = 'unchanged';
   

      // console.log('Avant mise à jour:', cart.items.map(item => ({ id: item, qty: item.quantity })));

      const option = await CartItem.getBindOptionFrom(bind, {id : product_id})
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
          if (!option?.stock) {
            throw new Error(`Ce produit n'a pas de stock maximun defini, vous devez specifier le stock que vous voulez`);
          }
          newQuantity = option?.stock;

          if (!cartItem) {
            action = 'added';
          } else {
            action = newQuantity === cartItem.quantity ? 'unchanged' : 'updated';
          }
          break;
      }

      if (
        (newQuantity !== null && newQuantity !== undefined) && !ignoreStock &&
        (
          newQuantity >
          (option?.stock ??
            (option?.continue_selling ?
              Infinity : 0
            )
          )
        )) {
        throw new Error(`Quantité (${newQuantity}) dépasse le stock (${option?.stock})`);
      }

      if (newQuantity === 0 && cartItem) {
        await cartItem.useTransaction(trx).delete();
        cartItem = null;
        action = 'removed';
      } else if (newQuantity !== null && newQuantity !== undefined) {
        if (cartItem) {
          cartItem.quantity = newQuantity;
          await cartItem.save();
        } else {
          let _bin = '{}';
          if (option?.realBind) {
            try {
              _bin = JSON.stringify(option.realBind);
            } catch (error) {
              throw new Error(`Le bind fourni est invalide : ${error.message}`);
            }
          }
          cartItem = await CartItem.create(
            {
              id: v4(),
              cart_id: cart.id,
              bind:_bin,
              quantity: newQuantity,
              product_id: product.id
            },
            { client: trx }
          );
        }
      }
  
      await cart.load('items', (query) =>
        query
          .orderBy('created_at', 'asc')
          .preload('product')
      )

      const result = { cart, updatedItem: cartItem, total: await cart.getTotal(trx), action };

      await trx.commit()

      return response.status(200).json({
        message: `Panier mis à jour avec succès (${mode})`,
        cart: result.cart,
        updatedItem: result.updatedItem,
        total: result.total,
        action: result.action,
      });
    } catch (error) {
      await trx.rollback()
      console.error('Erreur mise à jour panier:', error);
      return response.status(400).json({
        message: 'Erreur lors de la mise à jour du panier',
        error: error.message,
      });
    }
  }


  public async view_cart({ auth, session, response }: HttpContext): Promise<void> {
    let user: User | null = null;
  
    // Vérification de l'authentification
    try {
      user = await auth.authenticate();
    } catch (e) {
     // authentification SILENCIEUSE 
    }
  
    try {
      const cart = await this.getCart({ user, session });
      if (!cart) {
        return response.status(200).json({ cart: { items: [] }, total: 0 });
      }
      
      await cart.load('items', (query) =>
        query
      .orderBy('created_at', 'asc')
      .preload('product')
    );
    console.log("🚀 ~ CartsController ~ view_cart ~ cart:", cart.items)
  
      const items = await Promise.all(
        cart.items.map(async (item) => {
          // console.log("🚀 ~ CartsController ~ cart.items.map ~ item:", item)
          // console.log("🚀 ~ CartsController ~ cart.items.map ~ item-get:", item.getBind())
          const option =  (await CartItem.getBindOptionFrom(item.bind, {id : item.product_id}));
          console.log("🚀 ~ CartsController ~ cart.items.map ~ option:", option?.realBind)
          return { ...item.serialize(), realBind: option?.realBind };
        })
      );
  
      return response.status(200).json({
        cart: { ...cart.serialize(), items },
        total: await cart.getTotal(),
      });
    } catch (error) {
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

    const trx = await db.transaction();
    try {

      const tempCart = await Cart.query({ client: trx })
        .where('id', cartIdFromSession)
        .whereNull('user_id')
        .preload('items')
        .first();

      if (!tempCart || tempCart.items.length === 0) {
        session.forget('cart_id');
        await trx.commit();
        const userCart = await this.getCart({ user, session }); 
         if (userCart) {
            await userCart.load('items', q => q.orderBy('created_at', 'asc').preload('product'))
        }
        return response.status(200).json({
            message: 'Temporary cart not found or empty.',
            cart: userCart?.serialize() ?? null,
            total: userCart ? await userCart.getTotal() : 0
        });
      }

      let userCart = await Cart.query({ client: trx })
        .where('user_id', user.id)
        .preload('items')
        .first();

      if (!userCart) {
        userCart = await this.createCart(user, session, trx);
        await userCart.load('items');
      }

      for (const tempItem of tempCart.items) {
        let userCartItem = userCart.items?.find(
          (item) => item.compareBindTo(tempItem.getBind())
        );

        if (userCartItem) {
          userCartItem.quantity = tempItem.updated_at < userCart.updated_at ? userCartItem.quantity : tempItem.quantity;
          await userCartItem.useTransaction(trx).save();
        } else {
          tempItem.cart_id = userCart.id;
          await tempItem.useTransaction(trx).save(); 
        }
      }

      session.forget('cart_id');
      await tempCart.useTransaction(trx).delete();

      await trx.commit()

      await userCart.load('items', (query) =>
        query
          .orderBy('created_at', 'asc')
          .preload('product')
      );
      const result = { message: 'Panier fusionné avec succès', cart: userCart };

  

      return response.status(200).json({
        message: result.message,
        cart: result.cart || undefined,
        total: await result.cart?.getTotal() || undefined,
      });
    } catch (error) {
      await trx.rollback()
      console.error('Erreur lors de la fusion des paniers :', error);
      return response.status(500).json({
        message: 'Erreur lors de la fusion des paniers',
        error: error.message,
      });
    }
  }
}


















// public async remove_from_cart({ request, auth, response, session }: HttpContext): Promise<void> {
//   let user: User | null = null;
//   try {
//     user = await auth.authenticate();
//   } catch (e) {
//     // Utilisateur non authentifié
//   }

//   const { cart_item_id, removeAll = false } = request.body() as RemoveFromCartParams;

//   if (!cart_item_id && !removeAll) {
//     return response.status(400).json({ message: 'cart_item_id requis ou removeAll doit être true' });
//   }

//   try {
//     const result = await db.transaction(async (trx) => {
//       const cart = await this.getCart({ user, session, trx });
//       if (!cart) {
//         throw new Error('Panier non trouvé');
//       }

//       if (removeAll) {
//         await CartItem.query({ client: trx })
//           .where('cart_id', cart.id)
//           .delete();
//       } else {
//         const cartItem = await CartItem.query({ client: trx })
//           .where('id', cart_item_id!)
//           .where('cart_id', cart.id)
//           .firstOrFail();
//         await cartItem.delete();
//       }

//       await cart.load('items', (query) =>
//         query
//           .orderBy('created_at', 'asc')
//           .preload('group_product', (groupQuery) => groupQuery.preload('product'))
//       );

//       return { cart, total: cart.getTotal(trx) };
//     });

//     return response.status(200).json({
//       message: 'Suppression réussie',
//       cart: result.cart,
//       total: result.total,
//     });
//   } catch (error) {
//     console.error('Erreur suppression:', error);
//     return response.status(404).json({
//       message: 'Erreur lors de la suppression',
//       error: error.message,
//     });
//   }
// }