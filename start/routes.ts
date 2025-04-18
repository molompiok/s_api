/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/
import AuthController from '#controllers/auth_controller'
import CartsController from '#controllers/carts_controller'
import CategoriesController from '#controllers/categories_controller'
import CommentsController from '#controllers/comments_controller'
import DetailsController from '#controllers/details_controller'
import FavoritesController from '#controllers/favorites_controller'
import FeaturesController from '#controllers/features_controller'
import GlobaleServicesController from '#controllers/globale_services_controller'
import ProductsController from '#controllers/products_controller'
import RolesController from '#controllers/roles_controller'
import StatisticsController from '#controllers/stats_controller'
import UserAddressesController from '#controllers/user_addresses_controller'
import UserOrdersController from '#controllers/user_order_controller'
import UserPhonesController from '#controllers/user_phones_controller'
import UsersController from '#controllers/users_controller'
import ValuesController from '#controllers/values_controller'
import VisitesController from '#controllers/visites_controller'
import { TestMessages, TestValidator } from '#validators/FeaturesValidator'

import router from '@adonisjs/core/services/router'
import transmit from '@adonisjs/transmit/services/main'
import { env } from 'process'

import { startBullMQWoker } from './StartBullMQWoker.js'

transmit.registerRoutes()


// Auth
router.post('/register', [AuthController, 'register_mdp'])
router.post('/login', [AuthController, 'login'])
router.post('/logout', [AuthController, 'logout'])

// router.post('/update_account', [AuthController, 'update'])
router.delete("/delete_account", [AuthController, 'delete_account'])


// Authentification Google
router.post('/google_callback', [AuthController, 'google_auth'])

// Gestion de compte
router.get('/me', [AuthController, 'me'])
router.put('/update_user', [AuthController, 'update_user'])
router.delete('/delete', [AuthController, 'delete_account'])

// Users
router.get('/get_users', [UsersController, 'get_users'])

// Cart
router.post('/update_cart', [CartsController, 'update_cart'])
router.get('/view_cart', [CartsController, 'view_cart'])
router.post('/merge_cart_on_login', [CartsController, 'merge_cart_on_login'])


//Category
router.post('/create_category', [CategoriesController, 'create_category'])
router.get('/get_sub_categories', [CategoriesController, 'get_sub_categories'])
router.get('/get_categories', [CategoriesController, 'get_categories'])
router.get('/get_filters', [CategoriesController, 'get_filters'])
router.put('/update_category', [CategoriesController, 'update_category'])
router.delete('/delete_category/:id', [CategoriesController, 'delete_category'])
// router.get('/get_products_by_category', [CategoriesController, 'get_products_by_category'])  

//User_command_items
// router.get('/get_user_command_items', [UserCommandItemsController, 'get_user_command_items'])
// router.post('/add_command_item', [UserCommandItemsController, 'add_command_item'])
// router.delete('/delete_all_command_items', [UserCommandItemsController, 'delete_all_command_items'])
// router.delete('/delete_item_from_command', [UserCommandItemsController, 'delete_item_from_command'])

//CommmentForProduct
router.post('/create_comment', [CommentsController, 'create_comment'])
router.get('/get_comments', [CommentsController, 'get_comments'])
router.get('/get_comment', [CommentsController, 'get_comment'])
router.put('/update_comment', [CommentsController, 'update_comment'])
router.delete('/delete_comment/:id', [CommentsController, 'delete_comment'])

//Favorites
router.get('/get_favorites', [FavoritesController, 'get_favorites'])
router.post('/create_favorite', [FavoritesController, 'create_favorite'])
router.put('/update_favorites', [FavoritesController, 'update_favorites'])
router.delete('/delete_favorite/:id', [FavoritesController, 'delete_favorite'])

//Feature
router.get('/get_features', [FeaturesController, 'get_features'])
router.get('/get_features_with_values', [FeaturesController, 'get_features_with_values'])
router.post('/create_feature', [FeaturesController, 'create_feature'])
router.put('/update_feature', [FeaturesController, 'update_feature'])
router.post('/muptiple_update_features_values', [FeaturesController, 'multiple_update_features_values'])
router.delete('/delete_feature/:id', [FeaturesController, 'delete_feature'])

//Product
router.get('/get_products', [ProductsController, 'get_products'])
router.post('/create_product', [ProductsController, 'create_product'])
router.put('/update_product', [ProductsController, 'update_product'])
router.delete('/delete_product/:id', [ProductsController, 'delete_product'])

//role
router.get('/create_collaborator', [RolesController, 'create_collaborator'])
router.post('/add_remove_permission', [RolesController, 'add_remove_permission'])
router.get('/list_role', [RolesController, 'list_role'])
router.delete('/remove_collaborator/:id', [RolesController, 'remove_collaborator'])

//User_addreses
router.get('/create_user_address', [UserAddressesController, 'create_user_address'])
router.post('/create_user_address', [UserAddressesController, 'create_user_address'])
router.put('/update_user_address', [UserAddressesController, 'update_user_address'])
router.delete('/delete_user_address/:id', [UserAddressesController, 'delete_user_address'])

//User_orders
router.get('/get_users_orders', [UserOrdersController, 'get_users_orders'])
router.get('/get_orders', [UserOrdersController, 'get_orders'])

router.post('/create_user_order', [UserOrdersController, 'create_user_order'])
router.put('/update_user_order', [UserOrdersController, 'update_user_order'])
router.delete('/delete_user_order/:id', [UserOrdersController, 'delete_user_order'])

//user_phones
router.get('/create_user_phone', [UserPhonesController, 'create_user_phone'])
router.post('/create_user_phone', [UserPhonesController, 'create_user_phone'])
router.put('/update_user_phone', [UserPhonesController, 'update_user_phone'])
router.delete('/delete_user_phone/:id', [UserPhonesController, 'delete_user_phone'])

//values_feature
router.get('/get_values', [ValuesController, 'get_values'])
router.post('/create_value', [ValuesController, 'create_value'])
router.put('/update_value', [ValuesController, 'update_value'])
router.delete('/delete_value/:id', [ValuesController, 'delete_value'])

//values_feature
router.post('/create_detail', [DetailsController, 'create_detail'])
router.put('/update_detail', [DetailsController, 'update_detail'])
router.get('/get_details', [DetailsController, 'get_details'])
router.delete('/delete_detail/:id', [DetailsController, 'delete_detail'])

//GlobaleServices
router.get('/global_search', [GlobaleServicesController, 'global_search'])
router.post('/export_store', [GlobaleServicesController, 'export_store'])
router.post('/import_store', [GlobaleServicesController, 'import_store'])

//Visites
router.post('/visite', [VisitesController, 'visite'])
router.get('/get_visites', [VisitesController, 'get_visites'])

//Stats
router.get('/stats', [StatisticsController, 'index'])

router.get('/debug/request-scale-up', '#controllers/debug_controller.requestScaleUp')


router.group(() => {
  router.post('/login', [AuthController, 'login'])
  router.post('/register', [AuthController, 'register_mdp'])
  router.get('/verify-email', [AuthController, 'verifyEmail']) 
  router.post('/resend-verification', [AuthController, 'resendVerification'])
  
  router.post('/logout', [AuthController, 'logout'])
  router.get('/me', [AuthController, 'me'])
  router.put('/me', [AuthController, 'update_user']) 
  router.delete('/me', [AuthController, 'delete_account']) 

  //TODO utiliser un middleware spécifique qui vérifie un secret partagé ou une IP
  router.post('/_internal/auth/social-callback', [AuthController, 'handleSocialCallbackInternal'])

}).prefix('/api/auth') 







router.get('/', () => {
  return env
})

router.get('/test_sse', () => {
  console.log('/test_sse');

  transmit.broadcast('test:sse', {
    test: Date.now()
  })
  return {}
})

router.get('/uploads/*', ({ request, response }) => {

  return response.download('.' + request.url())
})

router.post('/test-vine', async ({ request, response }) => {
  const rawBody = request.body();
  console.log('Raw body:', rawBody);

  try {
    const payload = await TestValidator.validate({
      data: rawBody,
      messages: TestMessages,
    });
    return response.ok({ message: 'Validation succeeded', payload });
  } catch (error) {
    return response.badRequest({ message: 'Validation failed', errors: error.messages });
  }
});


await startBullMQWoker()