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
import FavoritesController from '#controllers/favorites_controller'
import FeaturesController from '#controllers/features_controller'
import GroupFeaturesController from '#controllers/group_features_controller'
import ProductsController from '#controllers/products_controller'
import RolesController from '#controllers/roles_controller'
import UserAddressesController from '#controllers/user_addresses_controller'
import UserCommandItemsController from '#controllers/user_command_items_controller'
import UserCommandsController from '#controllers/user_commands_controller'
import UserPhonesController from '#controllers/user_phones_controller'
import UsersController from '#controllers/users_controller'
import ValuesController from '#controllers/values_controller'

import router from '@adonisjs/core/services/router'
import { env } from 'process'

// Auth
router.post('/register', [AuthController, 'register_mdp'])
router.post('/login', [AuthController, 'login'])
router.post('/logout', [AuthController, 'logout'])

router.post('/update_account', [AuthController, 'update'])
router.delete("/delete_account",[AuthController, 'delete_account'])
 

// Authentification Google
router.post('/google_callback', [AuthController, 'google_auth']) 

// Gestion de compte
router.get('/me', [AuthController, 'me'])                
router.put('/update', [AuthController, 'update'])          
router.delete('/delete', [AuthController, 'delete_account'])

// Users
router.get('/get_users', [UsersController, 'get_users'])



//Cart
router.get('/get_cart_items', [CartsController, 'get_cart_items'])


//Category
router.post('/create_category', [CategoriesController, 'create_category'])
router.get('/get_categories', [CategoriesController, 'get_categories'])
router.put('/update_category', [CategoriesController, 'update_category'])
router.delete('/delete_category/:id', [CategoriesController, 'delete_category'])  

//User_command_items
router.get('/get_user_command_items', [UserCommandItemsController, 'get_user_command_items'])
router.post('/add_command_item', [UserCommandItemsController, 'add_command_item'])
router.delete('/delete_all_command_items', [UserCommandItemsController, 'delete_all_command_items'])
router.delete('/delete_item_from_command', [UserCommandItemsController, 'delete_item_from_command'])

//CommmentForProduct
router.post('/create_comment', [CommentsController, 'create_comment'])
router.get('/get_comments', [CommentsController, 'get_comments'])
router.put('/update_comment', [CommentsController, 'update_comment'])
router.delete('/delete/:id', [CommentsController, 'delete'])

//Favorites
router.get('/get_favorites', [FavoritesController, 'get_favorites'])
router.post('/create_favorite', [FavoritesController, 'create_favorite'])
router.put('/update_favorites',[FavoritesController, 'update_favorites'])
router.delete('/delete_favorite/:id', [FavoritesController, 'delete_favorite'])

//Feature
router.get('/get_features', [FeaturesController, 'get_features'])
router.get('/get_features_with_values', [FeaturesController, 'get_features_with_values'])
router.post('/create_feature', [FeaturesController, 'create_feature'])
router.put('/update_feature', [FeaturesController, 'update_feature'])
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
router.delete('/delete_user_addreses/:id', [UserAddressesController, 'delete_user_address'])

//User_command
router.get('/get_user_commands', [UserCommandsController, 'get_user_commands'])
router.post('/create_user_command', [UserCommandsController, 'create_user_command'])
router.put('/update_user_command', [UserCommandsController, 'update_user_command'])
router.delete('/delete_user_command/:id', [UserCommandsController, 'delete_user_command'])

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


router.post('/create_group', [GroupFeaturesController, 'create_group']) 
router.put('/update_group', [GroupFeaturesController, 'update_group']) 
router.get('/get_group_features', [GroupFeaturesController, 'get_group_features']) 
router.delete('/delete_group/:id', [GroupFeaturesController, 'delete_group']) 

router.get('/get_stock_by_feature', [GroupFeaturesController, 'get_stock_by_feature'])

router.get('/',()=>{
    return env
})


router.get('/uploads/*',({request, response})=>{

    return response.download('.'+request.url())
})