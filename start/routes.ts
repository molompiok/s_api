/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/
import AuthController from '#controllers/auth_controller'
import StoresController from '#controllers/stores_controller'

import router from '@adonisjs/core/services/router'

// Auth
router.post('/register', [AuthController, 'register'])
router.post('/login', [AuthController, 'login'])
router.post('/logout', [AuthController, 'logout'])
router.get('/me', [AuthController, 'me'])

// Store
router.post('/create_store', [StoresController, 'create_store'])
router.get('/get_stores', [StoresController, 'get_stores'])
router.put('/update_store/', [StoresController, 'update_store'])
router.get('/delete_store/:id', [StoresController, 'delete_store'])
