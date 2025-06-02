/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
*/
import router from '@adonisjs/core/services/router'
import transmit from '@adonisjs/transmit/services/main'
import { startBullMQWoker } from './StartBullMQWoker.js'
import env from './env.js'
import logger from '@adonisjs/core/services/logger'

// --- Import Controllers ---
import AuthController from '#controllers/auth_controller'
import CartsController from '#controllers/carts_controller'
import CategoriesController from '#controllers/categories_controller'
import CommentsController from '#controllers/comments_controller'
import DetailsController from '#controllers/details_controller'
import FavoritesController from '#controllers/favorites_controller'
import FeaturesController from '#controllers/features_controller'
import GlobaleServicesController from '#controllers/globale_services_controller'
import InventoriesController from '#controllers/inventories_controller'
import ProductsController from '#controllers/products_controller'
import RolesController from '#controllers/roles_controller'
import StatisticsController from '#controllers/stats_controller'
import UserAddressesController from '#controllers/user_addresses_controller'
import UserOrdersController from '#controllers/user_order_controller'
import UserPhonesController from '#controllers/user_phones_controller'
import UsersController from '#controllers/users_controller'
import ValuesController from '#controllers/values_controller'
import VisitesController from '#controllers/visites_controller'
import DebugController from '#controllers/debug_controller'

// --- Import pour la route /send_email (à déplacer idéalement) ---
import User from '#models/user'
import { DateTime } from 'luxon'
import BullMQService from '#services/BullMQService'
import './LoadMonitoring.js'

// --- Register Transmit Routes ---
transmit.registerRoutes();

// --- API V1 Routes ---
router.group(() => {

    // == Authentication & User Profile ==
    router.group(() => {
        router.post('/login', [AuthController, 'login'])
        router.post('/register', [AuthController, 'register_mdp'])
        router.get('/verify-email', [AuthController, 'verifyEmail']) // GET avec token en query param
        router.post('/resend-verification', [AuthController, 'resendVerification'])

        //  Routes Mot de Passe Oublié ---
        router.post('/forgot-password', [AuthController, 'forgotPassword'])
        router.post('/reset-password', [AuthController, 'resetPassword'])

        //  Route Setup Compte Collaborateur ---
        router.post('/setup-account', [AuthController, 'setupAccount'])
        router.post('/google_callback', [AuthController, 'google_auth'])
        // router.post('/auth_token_cookie', [AuthController ,'convertTokenToUser'])


        // --- Routes Authentifiées ---
        router.post('/logout', [AuthController, 'logout'])
        router.post('/logout-all', [AuthController, 'logoutAllDevices']) // Renommé pour clarté
        router.get('/me', [AuthController, 'me'])
        router.put('/me', [AuthController, 'update_user']) // Utiliser PUT pour update complet/partiel
        router.delete('/me', [AuthController, 'delete_account'])

        // Endpoint Interne pour Social Login Callback (sécurisé par middleware externe)
        router.post('/_internal/social-callback', [AuthController, 'handleSocialCallbackInternal'])
    }).prefix('/auth')

    // == Users (Admin/Management) ==
    router.group(() => {
        router.get('/', [UsersController, 'get_users'])
        // Ajouter d'autres routes si nécessaire (ex: GET /:id, PUT /:id, DELETE /:id)
    }).prefix('/users')

    // == Cart ==
    router.group(() => {
        router.post('/update', [CartsController, 'update_cart']) // Renommé pour clarté
        router.get('/', [CartsController, 'view_cart'])
        router.post('/merge', [CartsController, 'merge_cart_on_login']) // Renommé pour clarté
    }).prefix('/cart')

    // == Categories ==
    router.group(() => {
        router.post('/', [CategoriesController, 'create_category'])
        router.get('/', [CategoriesController, 'get_categories']) // Liste ou par ID/Slug via query
        router.get('/sub-categories', [CategoriesController, 'get_sub_categories']) // Route spécifique pour sous-catégories
        router.get('/filters', [CategoriesController, 'get_filters']) // Route spécifique pour filtres
        router.put('/:id', [CategoriesController, 'update_category']) // ID dans l'URL pour PUT
        // Le code d'update attendait category_id dans le body, ajustement ici vers /:id
        // Il faudra adapter le contrôleur pour prendre l'ID des params.
        router.delete('/:id', [CategoriesController, 'delete_category'])
    }).prefix('/categories')

    // == Comments ==
    router.group(() => {
        router.post('/', [CommentsController, 'create_comment'])
        router.get('/', [CommentsController, 'get_comments']) // Liste ou par ID/Produit via query
        router.get('/for-item', [CommentsController, 'get_comment']) // Route spécifique par order_item_id
        router.put('/:id', [CommentsController, 'update_comment']) // ID dans l'URL pour PUT
        // Le code d'update attendait comment_id dans le body. Adapter contrôleur.
        router.delete('/:id', [CommentsController, 'delete_comment'])
    }).prefix('/comments')

    // == Favorites ==
    router.group(() => {
        router.post('/', [FavoritesController, 'create_favorite'])
        router.get('/', [FavoritesController, 'get_favorites']) // Liste ou par ID via query
        router.put('/:id', [FavoritesController, 'update_favorites']) // ID dans l'URL pour PUT
        // Le code d'update attendait favorite_id dans le body. Adapter contrôleur.
        router.delete('/:id', [FavoritesController, 'delete_favorite'])
    }).prefix('/favorites')

    // == Features (Product Options) ==
    router.group(() => {
        router.post('/', [FeaturesController, 'create_feature'])
        router.get('/', [FeaturesController, 'get_features']) // Simple liste
        router.get('/with-values', [FeaturesController, 'get_features_with_values']) // Avec valeurs préchargées
        router.put('/:id', [FeaturesController, 'update_feature']) // ID dans l'URL pour PUT
        // Le code d'update attendait feature_id dans le body. Adapter contrôleur.
        router.post('/multiple-updates', [FeaturesController, 'multiple_update_features_values']) // Endpoint dédié
        router.delete('/:id', [FeaturesController, 'delete_feature'])
    }).prefix('/features')

    // == Values (Feature Options) ==
    router.group(() => {
        router.post('/', [ValuesController, 'create_value'])
        router.get('/', [ValuesController, 'get_values']) // Liste ou par ID via query
        router.put('/:id', [ValuesController, 'update_value']) // ID dans l'URL pour PUT
        // Le code d'update attendait value_id dans le body. Adapter contrôleur.
        router.delete('/:id', [ValuesController, 'delete_value'])
    }).prefix('/values')


    // == Details (Product Additional Content) ==
    router.group(() => {
        router.post('/', [DetailsController, 'create_detail'])
        router.get('/', [DetailsController, 'get_details'])   // Liste ou par ID via query
        router.put('/:id', [DetailsController, 'update_detail']) // ID dans l'URL pour PUT
        // Le code d'update attendait id/detail_id dans le body. Adapter contrôleur.
        router.delete('/:id', [DetailsController, 'delete_detail'])
    }).prefix('/details')

    // == Products ==
    router.group(() => {
        router.post('/', [ProductsController, 'create_product'])
        router.get('/', [ProductsController, 'get_products']) // Liste ou par ID/Slug via query
        router.put('/:id', [ProductsController, 'update_product']) // ID dans l'URL pour PUT
        // Le code d'update attendait product_id dans le body. Adapter contrôleur.
        router.delete('/:id', [ProductsController, 'delete_product'])
    }).prefix('/products')

    // == Roles & Collaborators ==
    router.group(() => {
        router.post('/collaborators', [RolesController, 'create_collaborator']) // Route plus RESTful
        router.get('/collaborators', [RolesController, 'list_role']) // Route plus RESTful
        router.post('/collaborators/permissions', [RolesController, 'add_remove_permission']) // Endpoint dédié permissions
        router.delete('/collaborators/:id', [RolesController, 'remove_collaborator']) // ID du collaborateur (user_id)
    }).prefix('/roles')

    // == User Addresses ==
    router.group(() => {
        router.post('/', [UserAddressesController, 'create_user_address'])
        router.get('/', [UserAddressesController, 'get_user_address']) // Liste ou par ID via query
        router.put('/:id', [UserAddressesController, 'update_user_address']) // ID dans l'URL pour PUT
        // Le code d'update attendait id dans le body. Adapter contrôleur.
        router.delete('/:id', [UserAddressesController, 'delete_user_address'])
    }).prefix('/user-addresses')

    // == User Phones ==    
    router.group(() => {
        router.post('/', [UserPhonesController, 'create_user_phone'])
        router.get('/', [UserPhonesController, 'get_user_phones']) // Liste ou par ID via query
        router.put('/:id', [UserPhonesController, 'update_user_phone']) // ID dans l'URL pour PUT
        // Le code d'update attendait id dans le body. Adapter contrôleur.
        router.delete('/:id', [UserPhonesController, 'delete_user_phone'])
    }).prefix('/user-phones')

    // == Orders ==
    router.group(() => {
        router.post('/', [UserOrdersController, 'create_user_order'])      // Client crée sa commande
        router.get('/my-orders', [UserOrdersController, 'get_orders'])     // Client récupère SES commandes
        router.get('/', [UserOrdersController, 'get_users_orders'])        // Admin/Collab récupère toutes/filtrées
        router.put('/:id/status', [UserOrdersController, 'update_user_order']) // Admin/Collab met à jour statut via ID URL
        // Le code d'update attendait user_order_id dans le body. Adapter contrôleur.
        router.delete('/:id', [UserOrdersController, 'delete_user_order']) // Admin/Collab supprime commande
    }).prefix('/orders')

    // == Inventories ==
    router.group(() => {
        router.post('/', [InventoriesController, 'create'])
        router.get('/', [InventoriesController, 'get_many'])        // Liste
        router.get('/:id', [InventoriesController, 'get'])     // Spécifique par ID URL
        router.put('/:id', [InventoriesController, 'update'])
        router.delete('/:id', [InventoriesController, 'delete'])
    }).prefix('/inventories')

    // == Global Services ==
    router.group(() => {
        router.get('/search', [GlobaleServicesController, 'global_search'])
        router.post('/export', [GlobaleServicesController, 'export_store'])
        router.post('/import', [GlobaleServicesController, 'import_store'])
    }).prefix('/global')

    // == Visits & Statistics ==
    router.group(() => {
        router.post('/track', [VisitesController, 'visite']) // Route pour tracker une visite (appelée par middleware?)
        router.get('/summary', [VisitesController, 'get_visites']) // Route pour récupérer les stats agrégées
        router.get('/kpi', [StatisticsController, 'getKpi']);           // Endpoint pour les KPIs
        router.get('/visits', [StatisticsController, 'getVisitDetails']); // Endpoint pour stats visites détaillées
        router.get('/orders', [StatisticsController, 'getOrderDetails']); // Route principale pour les stats détaillées
        router.get('/clients_stats', [UsersController, 'clients_stats']) // Route principale pour les stats détaillées
    }).prefix('/stats')

    // == Debug ==
    router.group(() => {
        router.get('/scale-up', [DebugController, 'requestScaleUp'])
        router.get('/scale-down', [DebugController, 'requestScaleDown'])
    }).prefix('/debug')

    // == Uploads (Route générique pour servir les fichiers uploadés) ==
    // Doit être DÉFINIE AVANT le préfixe /api/v1 si les URLs upload sont /uploads/*
    // router.get('/uploads/*', ...) // Cette route est définie plus bas

    // == Send Email (Debug/Test - À déplacer) ==
    router.get('/_test/send-email', async ({ request, response, i18n }) => { // Route de test préfixée
        const { email } = request.qs();
        if (!email) return response.badRequest('Email parameter is required');
        try {
            const user = await User.findByOrFail('email', email);
            // ... (logique génération token & envoi job - inchangée mais sujet traduit) ...
            const token = await User.accessTokens.create(user, ['*'], { expiresIn: '1 day' });
            const verificationUrl = `${env.get('APP_URL')}/api/v1/auth/verify-email?token=${token.value!.release()}`; // Adapter URL
            const queue = BullMQService.getServerToServerQueue();
            await queue.add('send_email', {
                event: 'send_email',
                data: {
                    to: user.email, subject: i18n.t('emails.verifySubject'), template: 'emails/verify_email',
                    context: { userName: user.full_name, verificationUrl: verificationUrl }
                }
            }, { jobId: `test-verify-email-${user.id}-${Date.now()}` });
            logger.info({ userId: user.id }, 'Test verification email sent');
            return response.ok('Test email queued.');
        } catch (error) {
            logger.error({ email, error }, 'Failed to send test email');
            return response.internalServerError('Failed to send test email');
        }
    });
}).prefix('/v1')

// start/routes.ts

router.get('/api/reverse', async ({ request, response }) => {
    const lat = request.input('lat')
    const lon = request.input('lon')

    if (!lat || !lon) {
        return response.badRequest({ error: 'Latitude et longitude obligatoires' })
    }

    const url = new URL('http://localhost:8003/reverse')
    url.searchParams.set('lat', lat)
    url.searchParams.set('lon', lon)
    url.searchParams.set('format', 'json')
    url.searchParams.set('addressdetails', '1')

    try {
        const res = await fetch(url.toString(), {
            headers: {
                'User-Agent': 'MyAdonisApp/1.0 (contact@tonsite.com)',
            },
        })

        if (!res.ok) {
            return response.status(res.status).send({ error: 'Erreur de Nominatim' })
        }

        const data = await res.json()
        console.log('data' ,data);
        
        return response.send(data)
    } catch (error) {
        console.error('Erreur reverse geocode:', error)
        return response.status(500).send({ error: 'Erreur serveur' })
    }
})

// .middleware([({request})=>{
//     console.log(request.completeUrl());
// }])
// Préfixe global pour la V1 de l'API

// --- Routes Hors API V1 ---

// Route statique pour les uploads (doit être en dehors du groupe /api/v1)
router.get('/uploads/*', async ({ request, response }) => {
    const filePath = request.param('*').join('/');
    const safePath = decodeURIComponent(filePath); // Décoder l'URL
    try {
        // Utiliser la méthode 'safe' pour le téléchargement
        // Il faudra peut-être spécifier le chemin complet vers le dossier 'uploads'
        // const absolutePath = app.makePath('public/uploads', safePath); // Exemple
        // return response.download(absolutePath);
        // Pour l'instant, on garde le chemin relatif mais c'est moins sûr
        return response.download(`.${request.url()}`);
    } catch (error) {
        logger.error({ path: safePath, error }, 'Failed to download file');
        return response.notFound('File not found');
    }
});

// Route de base (Statut/Version?)
router.get('/', () => {
    return { status: 'ok', version: env.get('API_VERSION', '1.0.0'), timestamp: DateTime.now().toISO() };
});

// Route Test SSE (gardée pour debug)
router.get('/test_sse', () => {
    logger.info('SSE test requested');
    const url = `store/${env.get('STORE_ID')}/update_command`;
    console.log(url);

    transmit.broadcast(`store/${env.get('STORE_ID')}/update_command`, { id: 'WWW' });
    return { message: 'SSE event broadcasted.' };
});


router.get('/send_email', async ({ request }) => {

    const user = await User.findByOrFail('email', request.qs().email)
    const token = await User.accessTokens.create(
        user,
        ['*'],
        {
            name: `api_login_${user.id}_${DateTime.now().toMillis()}`,
            expiresIn: '30 days' // Durée de vie du token
        }
    );
    const verificationUrl = `${env.get('APP_URL')}/api/auth/verify-email?token=${token.value!.release()}`;

    try {
        const queue = BullMQService.getServerToServerQueue();
        await queue.add('send_email', {
            event: 'send_email',
            data: {
                to: user.email,
                subject: 'Vérifiez votre adresse email - Sublymus',
                template: 'emails/verify_email', // Le template doit exister dans s_server
                context: {
                    userName: user.full_name,
                    verificationUrl: verificationUrl
                }
            }
        }, { jobId: `verify-email-${user.id}-${Date.now()}` });
        logger.info({ userId: user.id, email: user.email }, 'Verification email job sent to s_server');
    } catch (queueError) {
        logger.error({ userId: user.id, error: queueError.message }, 'Failed to send verification email job');
    }
    return
})



// --- Démarrage Worker BullMQ ---
// (Idéalement, cela devrait être dans un processus séparé ou un Service Provider)
await startBullMQWoker(); // Gardé à la fin comme dans l'original

