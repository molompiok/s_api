import Cart from '#models/cart';
import CartItem from '#models/cart_item';
import Product from '#models/product';
import User from '#models/user';
// import { UpdateCartMessage, updateCartValidator } from '#validators/CartValidator'; // Remplacé par Vine
import type { HttpContext } from '@adonisjs/core/http';
import db from '@adonisjs/lucid/services/db';
import { TransactionClientContract } from '@adonisjs/lucid/types/database';
import type { Session } from '@adonisjs/session'; // Importer le type Session
import vine from '@vinejs/vine'; // ✅ Ajout de Vine
import { DateTime } from 'luxon';
import { v4 } from 'uuid';
import { t } from '../utils/functions.js'; // ✅ Ajout de t
import { Infer } from '@vinejs/vine/types'; // ✅ Ajout de Infer
import logger from '@adonisjs/core/services/logger'; // Ajout pour logs
// Pas besoin de Bouncer, actions liées à l'utilisateur/session

// Définir les modes valides pour la validation
const VALID_CART_MODES = ['increment', 'decrement', 'set', 'clear', 'max'] as const;
type ValidCartMode = typeof VALID_CART_MODES[number];

// Interface conservée pour la clarté des retours internes
interface UpdateCartResult {
    cart: Cart;
    updatedItem: CartItem | null;
    total: number;
    action: 'added' | 'updated' | 'removed' | 'unchanged';
}
// Interface non utilisée directement mais décrit la structure attendue
// interface UpdateCartParams {
//   product_id: string;
//   mode: ValidCartMode;
//   value?: number;
//   bind?: Record<string, any>;
//   ignore_stock?: boolean;
// }


export default class CartsController {

    // --- Schémas de validation Vine ---
    private updateCartSchema = vine.compile(
        vine.object({
            product_id: vine.string().uuid(),
            mode: vine.enum(VALID_CART_MODES),
            value: vine.number().min(0).optional(), // Valider comme entier positif ou 0
            bind: vine.record(vine.any()).optional(), // Validation simple pour l'objet bind
            ignore_stock: vine.boolean().optional(),
        })
    );

    // Pas de schéma pour view_cart (pas d'input)
    // Pas de schéma pour merge_cart_on_login (pas d'input body/query)

    // --- Méthodes privées (logique inchangée) ---
    private async getCart({ user, session, trx }: { session: Session; user: User | null; trx?: TransactionClientContract }): Promise<Cart | null> {
        let query = Cart.query({ client: trx });

        if (user) {
            query = query.where('user_id', user.id);
        } else {
            const cartIdFromSession = session.get('cart_id');
            if (cartIdFromSession) {
                // Chercher par ID et s'assurer qu'il n'est PAS lié à un user_id
                query = query.where('id', cartIdFromSession).whereNull('user_id');
            } else {
                return null; // Pas de panier session
            }
        }
         // 🔍 Utiliser first() pour récupérer un seul panier
         return await query.first();
    }

    private async createCart(user: User | null, session: Session, trx?: TransactionClientContract): Promise<Cart> { // trx optionnel ici aussi
        const cartData: Partial<Cart> = { id: v4() };

        if (user) {
            cartData.user_id = user.id;
            // Pas d'expiration pour les paniers utilisateurs connectés
        } else {
             // Expiration seulement pour les paniers invités
             cartData.expires_at = DateTime.now().plus({ weeks: 2 });
        }

        const cart = await Cart.create(cartData, { client: trx }); // Utiliser trx si fourni

        if (!user) {
            // Stocker l'ID dans la session seulement pour les invités
            session.put('cart_id', cart.id);
        }

        return cart;
    }
    // --- Fin méthodes privées ---


    // --- Méthodes publiques (Contrôleur) ---

    public async update_cart({ request, auth, response, session }: HttpContext): Promise<void> {
        // 🔐 Authentification optionnelle (silencieuse)
        let user: User | null = null;
        try {
            // Utiliser check() pour ne pas lever d'erreur si non connecté
            if (await auth.check()) {
                 user = auth.user??null; // Pas besoin de authenticate() ici si on veut juste l'ID
            }
        } catch (e) {
             logger.warn({ error: e }, "Auth check failed during cart update, continuing as guest.");
        }

        let payload: Infer<typeof this.updateCartSchema>;
        try {
            // ✅ Validation Vine (Body)
            payload = await this.updateCartSchema.validate(request.body());
        } catch (error) {
            if (error.code === 'E_VALIDATION_ERROR') {
                 // 🌍 i18n
                 // Utiliser un statut 422 (Unprocessable Entity) pour les erreurs de validation
                 response.unprocessableEntity({ message: t('validationFailed'), errors: error.messages });
                 return; // Arrêter l'exécution
            }
            throw error;
        }

        // Extraire et typer les données validées
        const { product_id, mode, value: rawValue, ignore_stock = false, bind = {} } = payload;
        let value = rawValue ?? 1; // Valeur par défaut 1 si non fournie (après validation)

        // --- Logique métier (avec ajustements mineurs pour utiliser payload) ---
         // Validations métier supplémentaires (non couvertes par Vine simple)
         if (mode === 'set' && value < 0) {
             // 🌍 i18n
             response.badRequest({ message: t('cart.negativeQuantityNotAllowed') }); // Nouvelle clé
             return;
         }
         if ((mode === 'increment' || mode === 'decrement') && value <= 0) {
             // 🌍 i18n
             response.badRequest({ message: t('cart.positiveValueRequiredForIncDec') }); // Nouvelle clé
             return;
         }
         // La vérification de bind comme objet n'est plus nécessaire grâce à Vine

        const trx = await db.transaction();
        try {
            const product = await Product.find(product_id, { client: trx });
            if (!product) {
                 await trx.rollback();
                 // 🌍 i18n
                 response.notFound({ message: t('product.notFound') });
                 return;
            }

            let cart = await this.getCart({ user, session, trx });
            if (!cart) {
                // Crée un panier utilisateur ou invité selon le contexte
                cart = await this.createCart(user, session, trx);
                logger.info({ userId: user?.id, sessionId: user ? undefined : session.sessionId, cartId: cart.id }, "New cart created");
            }

            // Utiliser une requête unique pour trouver l'item existant (évite race condition)
            let cartItem = await CartItem.query({ client: trx })
                .forUpdate() // Verrouillage pour la transaction
                .where('cart_id', cart.id)
                .where('product_id', product_id)
                .preload('product') // Précharger produit si besoin plus tard
                .whereRaw('bind::jsonb = ?', [JSON.stringify(bind)]) // Comparaison JSON exacte
                .first();

            let newQuantity: number | null | undefined = undefined;
            let action: UpdateCartResult['action'] = 'unchanged';
            const option = await CartItem.getBindOptionFrom(bind, { id: product_id }); // Calculer détails de l'option

            switch (mode) {
                case 'increment':
                    newQuantity = (cartItem ? cartItem.quantity : 0) + value;
                    action = cartItem ? 'updated' : 'added';
                    break;
                case 'decrement':
                    if (!cartItem || cartItem.quantity < value) {
                         // 🌍 i18n
                         throw new Error(t('cart.cannotDecrement', { current: cartItem?.quantity ?? 0, requested: value })); // Nouvelle clé
                    }
                    newQuantity = cartItem.quantity - value;
                    action = newQuantity === 0 ? 'removed' : 'updated';
                    break;
                case 'set':
                    newQuantity = value; // Déjà validé >= 0
                    if (!cartItem && newQuantity > 0) action = 'added';
                    else if (cartItem && newQuantity !== cartItem.quantity) action = newQuantity === 0 ? 'removed' : 'updated';
                    else if (cartItem && newQuantity === 0) action = 'removed';
                    break;
                case 'clear':
                    if (cartItem) action = 'removed';
                    newQuantity = 0; // Force la suppression
                    break;
                case 'max':
                    // Utiliser le stock calculé par getBindOptionFrom
                    const maxStock = option?.stock ?? (option?.continue_selling ? Infinity : 0);
                     if (maxStock === Infinity || maxStock === null || maxStock === undefined) {
                          // 🌍 i18n
                          throw new Error(t('cart.maxStockUndefined')); // Nouvelle clé
                     }
                     newQuantity = maxStock;
                     action = cartItem ? (newQuantity === cartItem.quantity ? 'unchanged' : 'updated') : 'added';
                     break;
            }

            // Vérification du stock (après calcul de newQuantity)
             const availableStock = option?.stock ?? (option?.continue_selling ? Infinity : 0);
             if (!ignore_stock && newQuantity !== undefined && newQuantity !== null && newQuantity > availableStock) {
                 // 🌍 i18n
                 throw new Error(t('cart.quantityExceedsStock', { quantity: newQuantity, stock: availableStock })); // Nouvelle clé
             }


             // Application des changements dans la transaction
             if (newQuantity === 0) {
                 if (cartItem) {
                     await cartItem.useTransaction(trx).delete();
                     cartItem = null; // Marquer comme supprimé
                     action = 'removed'; // Confirmer l'action
                 }
                 // Si cartItem n'existait pas et newQuantity est 0, ne rien faire
             } else if (newQuantity !== undefined && newQuantity !== null) {
                 if (cartItem) {
                      // Mettre à jour l'item existant
                      if (cartItem.quantity !== newQuantity) { // Optimisation: ne sauver que si la quantité change
                          cartItem.quantity = newQuantity;
                          await cartItem.useTransaction(trx).save();
                      }
                 } else {
                      // Créer un nouvel item
                      let bindJson = '{}';
                      try { bindJson = JSON.stringify(option?.realBind || {}); } catch {} // Utiliser realBind calculé

                      cartItem = await CartItem.create({
                          id: v4(), cart_id: cart.id, bind: bindJson,
                          quantity: newQuantity, product_id: product.id
                      }, { client: trx });
                 }
             }
             // Si newQuantity est undefined ou null (cas 'clear' sans item existant), ne rien faire.

             // Recharger le panier complet pour la réponse finale (après commit)
             await trx.commit(); // Commit les changements DB

             // Recharger hors transaction
             await cart.load('items', (query) => query.orderBy('created_at', 'asc').preload('product'));
             const finalTotal = await cart.getTotal(); // Recalculer le total final

             logger.info({ userId: user?.id, sessionId: user ? undefined : session.sessionId, cartId: cart.id, action, productId: product_id, newQuantity }, "Cart updated");

             // 🌍 i18n
             return response.ok({ // Utiliser 200 OK pour update
                 message: t('cart.updateSuccess', { mode: mode }), // Nouvelle clé
                 cart: cart, // Le panier rechargé
                 updatedItem: cartItem, // L'item modifié/ajouté ou null si supprimé
                 total: finalTotal,
                 action: action,
             });

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user?.id, sessionId: user ? undefined : session.sessionId, payload, error: error.message, stack: error.stack }, 'Failed to update cart');
             // Distinguer les erreurs métier des erreurs serveur
             if (error.message.startsWith(t('cart.cannotDecrement', { current: 0, requested: 0 }).substring(0, 10)) ||
                 error.message.startsWith(t('cart.maxStockUndefined').substring(0, 10)) ||
                 error.message.startsWith(t('cart.quantityExceedsStock', { quantity: 0, stock: 0 }).substring(0, 10)))
             {
                  // 🌍 i18n (Erreurs métier) -> 400 Bad Request
                  return response.badRequest({ message: error.message });
             }
              // 🌍 i18n (Erreur interne) -> 500
             return response.internalServerError({ message: t('cart.updateFailed'), error: error.message }); // Nouvelle clé
        }
    }


    public async view_cart({ auth, session, response }: HttpContext): Promise<void> {
        // 🔐 Authentification optionnelle (silencieuse)
        let user: User | null = null;
        try {
            if (await auth.check()) {
                 user = auth.user??null;
            }
        } catch (e) {
             logger.warn({ error: e }, "Auth check failed during cart view, continuing as guest.");
        }

        try {
            // --- Logique métier (inchangée mais utilise getCart) ---
            const cart = await this.getCart({ user, session }); // Pas besoin de trx pour lecture simple
            if (!cart) {
                 // Retourner un panier vide si aucun n'existe
                 return response.ok({ cart: { id: null, items: [], user_id: user?.id ?? null }, total: 0 });
            }

            // Précharger les items et produits associés
            await cart.load('items', (query) => query.orderBy('created_at', 'asc').preload('product'));

            // Enrichir les items avec realBind pour le frontend
             const itemsWithRealBind = await Promise.all(
                 cart.items.map(async (item) => {
                     const option = item.product ? await CartItem.getBindOptionFrom(item.bind, { id: item.product_id }) : null;
                     return { ...item.serialize(), realBind: option?.realBind ?? {} }; // Fournir objet vide si pas de realBind
                 })
             );

             // Pas de message i18n car on retourne les données
             return response.ok({
                 cart: { ...cart.serialize(), items: itemsWithRealBind }, // Renvoyer le panier enrichi
                 total: await cart.getTotal(), // Calculer le total
             });

        } catch (error) {
             logger.error({ userId: user?.id, sessionId: user ? undefined : session.sessionId, error: error.message, stack: error.stack }, 'Failed to view cart');
              // 🌍 i18n
             return response.internalServerError({ message: t('cart.fetchFailed'), error: error.message }); // Nouvelle clé
        }
    }

    // Fusionner panier invité et panier user lors du login
    public async merge_cart_on_login({ auth, session, response }: HttpContext): Promise<void> {
        // 🔐 Authentification (Requise pour la fusion)
        await auth.authenticate();
        const user = auth.user!;

        const cartIdFromSession = session.get('cart_id');

        if (!cartIdFromSession) {
             // 🌍 i18n
             // Si pas de panier session, renvoyer le panier user actuel (ou vide)
             const userCart = await this.getCart({ user, session });
             if (userCart) await userCart.load('items', q => q.orderBy('created_at', 'asc').preload('product'));
             return response.ok({
                 message: t('cart.noGuestCartToMerge'), // Nouvelle clé
                 cart: userCart,
                 total: userCart ? await userCart.getTotal() : 0
             });
        }

        const trx = await db.transaction();
        try {
             // --- Logique métier (avec améliorations/clarifications) ---
            // 1. Récupérer le panier temporaire (invité)
            const tempCart = await Cart.query({ client: trx })
                .where('id', cartIdFromSession)
                .whereNull('user_id') // S'assurer que c'est bien un panier invité
                .preload('items')
                .first();

            // Si panier invité non trouvé ou vide, on le supprime de la session et on renvoie le panier user
            if (!tempCart || tempCart.items.length === 0) {
                session.forget('cart_id');
                 if (tempCart) await tempCart.useTransaction(trx).delete(); // Supprimer le panier vide
                 await trx.commit(); // Commit la suppression potentielle

                 const userCart = await this.getCart({ user, session }); // Récupérer hors transaction
                 if (userCart) await userCart.load('items', q => q.orderBy('created_at', 'asc').preload('product'));
                 // 🌍 i18n
                 return response.ok({
                      message: t('cart.guestCartEmptyOrNotFound'), // Nouvelle clé
                      cart: userCart,
                      total: userCart ? await userCart.getTotal() : 0
                 });
            }

            // 2. Récupérer ou créer le panier de l'utilisateur connecté
            let userCart = await Cart.query({ client: trx })
                .where('user_id', user.id)
                .preload('items') // Précharger pour comparaison
                .first();

            if (!userCart) {
                 // Créer un panier pour l'utilisateur s'il n'en a pas
                 userCart = await this.createCart(user, session, trx);
                 await userCart.load('items'); // Charger la relation vide
                 logger.info({ userId: user.id, cartId: userCart.id }, "User cart created during merge");
            } else {
                 logger.info({ userId: user.id, cartId: userCart.id }, "Merging into existing user cart");
            }


             // 3. Fusionner les items du panier invité vers le panier utilisateur
             for (const tempItem of tempCart.items) {
                 // Trouver un item correspondant (même produit + même bind) dans le panier user
                 const userCartItem = userCart.items.find(
                     (item) => item.product_id === tempItem.product_id && item.compareBindTo(tempItem.bind)
                 );

                 if (userCartItem) {
                     // Si trouvé: Additionner les quantités (ou prendre la plus récente?) - Additionnons pour l'instant
                     userCartItem.quantity += tempItem.quantity;
                     // TODO: Vérifier le stock ici avant de sauvegarder si nécessaire
                     await userCartItem.useTransaction(trx).save();
                     logger.debug({ userId: user.id, cartItemId: userCartItem.id, newQuantity: userCartItem.quantity }, "Merged item quantity updated");
                     // Supprimer l'item temporaire traité (optionnel mais propre)
                      // await tempItem.useTransaction(trx).delete(); // Fait par la suppression du tempCart
                 } else {
                      // Si non trouvé: Attacher l'item temporaire au panier utilisateur
                      tempItem.cart_id = userCart.id;
                      await tempItem.useTransaction(trx).save(); // Sauvegarder le changement de cart_id
                      logger.debug({ userId: user.id, cartItemId: tempItem.id }, "Guest item moved to user cart");
                      // Ajouter l'item à la collection chargée pour la réponse finale? Non, on recharge à la fin.
                 }
             }

            // 4. Supprimer le panier temporaire et l'ID de la session
            session.forget('cart_id');
            await tempCart.useTransaction(trx).delete();

            await trx.commit(); // Commit final après fusion et suppressions

            // 5. Recharger le panier utilisateur complet pour la réponse
            await userCart.load('items', (query) => query.orderBy('created_at', 'asc').preload('product'));
            const finalTotal = await userCart.getTotal();

            logger.info({ userId: user.id, oldCartId: tempCart.id, newCartId: userCart.id }, "Carts merged successfully");

             // 🌍 i18n
             return response.ok({
                 message: t('cart.mergeSuccess'), // Nouvelle clé
                 cart: userCart, // Le panier utilisateur fusionné et rechargé
                 total: finalTotal,
             });

        } catch (error) {
            await trx.rollback();
            logger.error({ userId: user.id, cartIdFromSession, error: error.message, stack: error.stack }, 'Failed to merge carts');
             // 🌍 i18n
             return response.internalServerError({ message: t('cart.mergeFailed'), error: error.message }); // Nouvelle clé
        }
    }
}