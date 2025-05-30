import Cart from '#models/cart';
import CartItem from '#models/cart_item';
import Product from '#models/product';
import User from '#models/user';
import type { HttpContext } from '@adonisjs/core/http';
import db from '@adonisjs/lucid/services/db';
import { TransactionClientContract } from '@adonisjs/lucid/types/database';
// Session n'est plus importé car non utilisé pour la logique panier ici
import vine from '@vinejs/vine';
import { DateTime } from 'luxon';
import { v4 } from 'uuid';
import { t } from '../utils/functions.js';
import { Infer } from '@vinejs/vine/types';
import logger from '@adonisjs/core/services/logger';
import { securityService } from '#services/SecurityService';

const VALID_CART_MODES = ['increment', 'decrement', 'set', 'clear', 'max'] as const;

interface UpdateCartResult {
    cart: Cart;
    updatedItem: CartItem | null;
    total: number;
    action: 'added' | 'updated' | 'removed' | 'unchanged';
    new_guest_cart_id?: string | null; // Pour renvoyer l'ID d'un nouveau panier invité
}

export default class CartsController {

    // --- Schémas de validation Vine ---
    private updateCartSchema = vine.compile(
        vine.object({
            product_id: vine.string().uuid(),
            mode: vine.enum(VALID_CART_MODES),
            value: vine.number().min(0).optional(),
            bind: vine.record(vine.any()).optional(),
            ignore_stock: vine.boolean().optional(),
            guest_cart_id: vine.string().uuid().optional(), // ID du panier invité fourni par le client
        })
    );

    // Schéma pour view_cart si guest_cart_id est passé en query (optionnel)
    private viewCartSchema = vine.compile(
        vine.object({
            guest_cart_id: vine.string().uuid().optional(),
        })
    );

    // Schéma pour merge_cart si guest_cart_id est passé dans le body (optionnel mais attendu si fusion)
    private mergeCartSchema = vine.compile(
        vine.object({
            guest_cart_id: vine.string().uuid().optional(), // Optionnel, mais la logique attendra un ID pour fusionner
        })
    );


    // --- Méthodes privées ---
    private async getCart({ user, guestCartId, trx }: { user: User | null; guestCartId?: string; trx?: TransactionClientContract }): Promise<Cart | null> {
        let query = Cart.query({ client: trx });

        if (user) {
            query = query.where('user_id', user.id);
        } else if (guestCartId) {
            query = query.where('id', guestCartId).whereNull('user_id');
        } else {
            return null; // Invité sans guestCartId (ou utilisateur sans panier encore)
        }
        return await query.first();
    }

    private async createCart(user: User | null, trx?: TransactionClientContract): Promise<Cart> {
        const cartData: Partial<Cart> = { id: v4() };

        if (user) {
            cartData.user_id = user.id;
        } else {
            cartData.expires_at = DateTime.now().plus({ weeks: 2 });
        }

        const cart = await Cart.create(cartData, { client: trx });
        // La mise en session de cart_id est supprimée. Le client stocke l'ID du panier invité.
        return cart;
    }
    // --- Fin méthodes privées ---


    // --- Méthodes publiques (Contrôleur) ---

    public async update_cart({ request, auth, response }: HttpContext): Promise<void> {
        logger.info('🛒 Update Cart Request Received');
        let user: User | null = null;
        try {
            if (await auth.check()) {
                user = auth.user ?? null;
            }
        } catch (e) {
            logger.warn({ error: e }, "Auth check failed during cart update, continuing as guest.");
        }

        let payload: Infer<typeof this.updateCartSchema>;
        try {
            payload = await this.updateCartSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
                return;
            }
            logger.error({ error, body: request.body() }, "Validation failed for update_cart");
            throw error;
        }

        const { product_id, mode, value: rawValue, ignore_stock = false, bind = {}, guest_cart_id: guestCartIdFromPayload } = payload;
        let value = rawValue ?? 1;

        if (mode === 'set' && value < 0) {
            response.badRequest({ message: t('cart.negativeQuantityNotAllowed') });
            return;
        }
        if ((mode === 'increment' || mode === 'decrement') && value <= 0) {
            response.badRequest({ message: t('cart.positiveValueRequiredForIncDec') });
            return;
        }

        const trx = await db.transaction();
        let newGuestCartIdToReturn: string | null = null;

        try {
            const product = await Product.find(product_id, { client: trx });
            if (!product) {
                await trx.rollback();
                response.notFound({ message: t('product.notFound') });
                return;
            }

            let cart = await this.getCart({ user, guestCartId: user ? undefined : guestCartIdFromPayload, trx });

            if (!cart) {
                cart = await this.createCart(user, trx);
                if (!user) {
                    newGuestCartIdToReturn = cart.id;
                    logger.info({ guestCartId: cart.id }, "New guest cart created");
                } else {
                    logger.info({ userId: user.id, cartId: cart.id }, "New user cart created");
                }
            } else {
                logger.info({ cartId: cart.id, userId: user?.id, guestCartIdProvided: user ? undefined : guestCartIdFromPayload }, "Existing cart retrieved");
            }

            let cartItem = await CartItem.query({ client: trx })
                .forUpdate()
                .where('cart_id', cart.id)
                .where('product_id', product_id)
                .preload('product')
                .whereRaw('bind::jsonb = ?', [JSON.stringify(bind)])
                .first();

            let newQuantity: number | null | undefined = undefined;
            let action: UpdateCartResult['action'] = 'unchanged';
            const option = await CartItem.getBindOptionFrom(bind, { id: product_id });

            switch (mode) {
                case 'increment':
                    newQuantity = (cartItem ? cartItem.quantity : 0) + value;
                    action = cartItem ? 'updated' : 'added';
                    break;
                case 'decrement':
                    if (!cartItem || cartItem.quantity < value) {
                        throw new Error(t('cart.cannotDecrement', { current: cartItem?.quantity ?? 0, requested: value }));
                    }
                    newQuantity = cartItem.quantity - value;
                    action = newQuantity === 0 ? 'removed' : 'updated';
                    break;
                case 'set':
                    newQuantity = value;
                    if (!cartItem && newQuantity > 0) action = 'added';
                    else if (cartItem && newQuantity !== cartItem.quantity) action = newQuantity === 0 ? 'removed' : 'updated';
                    else if (cartItem && newQuantity === 0) action = 'removed';
                    break;
                case 'clear':
                    if (cartItem) action = 'removed';
                    newQuantity = 0;
                    break;
                case 'max':
                    const maxStock = option?.stock ?? (option?.continue_selling ? Infinity : 0);
                    if (maxStock === Infinity || maxStock === null || maxStock === undefined) {
                        throw new Error(t('cart.maxStockUndefined'));
                    }
                    newQuantity = maxStock;
                    action = cartItem ? (newQuantity === cartItem.quantity ? 'unchanged' : 'updated') : 'added';
                    break;
            }

            const availableStock = option?.stock ?? (option?.continue_selling ? Infinity : 0);
            if (!ignore_stock && newQuantity !== undefined && newQuantity !== null && newQuantity > availableStock) {
                throw new Error(t('cart.quantityExceedsStock', { quantity: newQuantity, stock: availableStock }));
            }

            if (newQuantity === 0) {
                if (cartItem) {
                    await cartItem.useTransaction(trx).delete();
                    cartItem = null;
                    action = 'removed';
                }
            } else if (newQuantity !== undefined && newQuantity !== null) {
                if (cartItem) {
                    if (cartItem.quantity !== newQuantity) {
                        cartItem.quantity = newQuantity;
                        await cartItem.useTransaction(trx).save();
                    }
                } else {
                    let bindJson = '{}';
                    try { bindJson = JSON.stringify(option?.realBind || {}); } catch { }
                    cartItem = await CartItem.create({
                        id: v4(), cart_id: cart.id, bind: bindJson,
                        quantity: newQuantity, product_id: product.id
                    }, { client: trx });
                }
            }

            await trx.commit();
            await cart.load('items', (query) => query.orderBy('created_at', 'asc').preload('product'));
            const finalTotal = await cart.getTotal();

            logger.info({
                cartId: cart.id,
                userId: user?.id,
                guestCartIdUsed: user ? undefined : (guestCartIdFromPayload || newGuestCartIdToReturn),
                action,
                productId: product_id,
                newQuantity
            }, "Cart updated successfully");

            const responsePayload: UpdateCartResult = {
                cart: cart,
                updatedItem: cartItem,
                total: finalTotal,
                action: action,
            };
            if (newGuestCartIdToReturn) {
                responsePayload.new_guest_cart_id = newGuestCartIdToReturn;
            }

            return response.ok(responsePayload);

        } catch (error) {
            await trx.rollback();
            logger.error({
                userId: user?.id,
                guestCartIdAttempted: user ? undefined : guestCartIdFromPayload,
                payload,
                error: error.message,
                stack: error.stack
            }, 'Failed to update cart');

            if (error.message.startsWith(t('cart.cannotDecrement', { current: 0, requested: 0 }).substring(0, 10)) ||
                error.message.startsWith(t('cart.maxStockUndefined').substring(0, 10)) ||
                error.message.startsWith(t('cart.quantityExceedsStock', { quantity: 0, stock: 0 }).substring(0, 10))) {
                return response.badRequest({ message: error.message });
            }
            return response.internalServerError({ message: t('cart.updateFailed'), error: error.message });
        }
    }


    public async view_cart({ auth, request, response }: HttpContext): Promise<void> {
        let user: User | null = null;
        try {
            if (await auth.check()) {
                user = auth.user ?? null;
            }
        } catch (e) {
            logger.warn({ error: e }, "Auth check failed during cart view, continuing as guest.");
        }

        let guestCartIdFromQuery: string | undefined;
        if (!user) {
            try {
                // Valider les query params pour guest_cart_id s'il est fourni
                const queryParams = await this.viewCartSchema.validate(request.qs());
                guestCartIdFromQuery = queryParams.guest_cart_id;
            } catch (error) {
                if (error.code === 'E_VALIDATION_ERROR') {
                    // Ne pas bloquer si la validation échoue, guestCartIdFromQuery restera undefined
                    logger.warn({ errors: error.messages }, "Invalid guest_cart_id in query for view_cart");
                } else {
                    throw error;
                }
            }
        }

        try {
            const cart = await this.getCart({ user, guestCartId: user ? undefined : guestCartIdFromQuery });

            if (!cart) {
                return response.ok({
                    cart: { id: null, items: [], user_id: user?.id ?? null, guest_cart_id: user ? null : guestCartIdFromQuery || null },
                    total: 0,
                    message: user ? t('cart.userCartEmpty') : t('cart.guestCartEmptyOrNotFound')
                });
            }

            await cart.load('items', (query) => query.orderBy('created_at', 'asc').preload('product'));

            const itemsWithRealBind = await Promise.all(
                cart.items.map(async (item) => {
                    const option = item.product ? await CartItem.getBindOptionFrom(item.bind, { id: item.product_id }) : null;

                    return { ...item.serialize(), realBind: option?.realBind ?? {}, additional_price: option?.additional_price ?? 0, quantity: item.quantity, product: item.product };
                })
            );

            const totalPrice = itemsWithRealBind.reduce((total, item) => {
                const basePrice = item.product?.price || 0;
                const additionalPrice = item.additional_price || 0;
                const quantity = item.quantity || 1;

                return total + (basePrice + additionalPrice) * quantity;
            }, 0);


            return response.ok({
                cart: { ...cart.serialize(), items: itemsWithRealBind },
                total: totalPrice,
            });

        } catch (error) {
            logger.error({ userId: user?.id, guestCartId: user ? undefined : guestCartIdFromQuery, error: error.message, stack: error.stack }, 'Failed to view cart');
            return response.internalServerError({ message: t('cart.fetchFailed'), error: error.message });
        }
    }

    public async merge_cart_on_login({ auth, request, response }: HttpContext): Promise<void> {
        await securityService.authenticate({ request, auth }); // Assure que l'utilisateur est connecté
        const user = auth.user!;

        let payload: Infer<typeof this.mergeCartSchema>;
        try {
            payload = await this.mergeCartSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
                return;
            }
            logger.error({ error, body: request.body() }, "Validation failed for merge_cart_on_login");
            throw error;
        }
        const { guest_cart_id: cartIdFromClient } = payload;


        if (!cartIdFromClient) {
            const userCart = await this.getCart({ user });
            if (userCart) await userCart.load('items', q => q.orderBy('created_at', 'asc').preload('product'));
            return response.ok({
                message: t('cart.noGuestCartToMerge'),
                cart: userCart,
                total: userCart ? await userCart.getTotal() : 0
            });
        }

        const trx = await db.transaction();
        try {
            const tempCart = await Cart.query({ client: trx })
                .where('id', cartIdFromClient)
                .whereNull('user_id') // Important: S'assurer que c'est bien un panier invité
                .preload('items')
                .first();

            if (!tempCart || tempCart.items.length === 0) {
                if (tempCart) await tempCart.useTransaction(trx).delete(); // Supprimer le panier invité vide s'il existe
                await trx.commit();

                const userCart = await this.getCart({ user });
                if (userCart) await userCart.load('items', q => q.orderBy('created_at', 'asc').preload('product'));
                return response.ok({
                    message: t('cart.guestCartEmptyOrNotFoundForMerge'), // Message plus spécifique
                    cart: userCart,
                    total: userCart ? await userCart.getTotal() : 0
                });
            }

            let userCart = await Cart.query({ client: trx })
                .where('user_id', user.id)
                .preload('items')
                .first();

            if (!userCart) {
                userCart = await this.createCart(user, trx);
                await userCart.load('items'); // Charger la relation (vide au début)
                logger.info({ userId: user.id, cartId: userCart.id }, "User cart created during merge");
            } else {
                logger.info({ userId: user.id, cartId: userCart.id }, "Merging into existing user cart");
            }

            for (const tempItem of tempCart.items) {
                const userCartItem = userCart.items.find(
                    (item) => item.product_id === tempItem.product_id && item.compareBindTo(tempItem.bind)
                );

                if (userCartItem) {
                    userCartItem.quantity += tempItem.quantity;
                    // TODO: Optionnellement, vérifier le stock ici avant de sauvegarder
                    await userCartItem.useTransaction(trx).save();
                    logger.debug({ userId: user.id, cartItemId: userCartItem.id, newQuantity: userCartItem.quantity }, "Merged item quantity updated");
                } else {
                    // Détacher l'item du tempCart et l'attacher au userCart
                    tempItem.cart_id = userCart.id;
                    await tempItem.useTransaction(trx).save();
                    // Ajouter à la collection chargée de userCart pour la réponse immédiate si besoin, ou recharger plus tard
                    userCart.items.push(tempItem); // Pour que le .getTotal() soit correct s'il est appelé avant recharge
                    logger.debug({ userId: user.id, cartItemId: tempItem.id }, "Guest item moved to user cart");
                }
            }

            await tempCart.useTransaction(trx).delete(); // Supprimer l'ancien panier invité
            await trx.commit();

            await userCart.load('items', (query) => query.orderBy('created_at', 'asc').preload('product')); // Recharger pour être sûr
            const finalTotal = await userCart.getTotal();

            logger.info({ userId: user.id, oldGuestCartId: tempCart.id, newUserCartId: userCart.id }, "Carts merged successfully");

            return response.ok({
                message: t('cart.mergeSuccess'),
                cart: userCart,
                total: finalTotal,
            });

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user.id, guestCartIdFromClient: cartIdFromClient, error: error.message, stack: error.stack }, 'Failed to merge carts');
            return response.internalServerError({ message: t('cart.mergeFailed'), error: error.message });
        }
    }
}