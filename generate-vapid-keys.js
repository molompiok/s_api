import webpush from'web-push';

const vapidKeys = webpush.generateVAPIDKeys();

console.log('--- VAPID Keys ---');
console.log('IMPORTANT: Conservez ces clés en lieu sûr !');
console.log('------------------');
console.log('Clé Publique (Public Key):');
console.log(vapidKeys.publicKey);
console.log('\nClé Privée (Private Key):');
console.log(vapidKeys.privateKey);
console.log('------------------');
console.log('\nAjoutez ces clés à vos fichiers d\'environnement (.env)');
console.log(`\nVAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log("VAPID_SUBJECT='mailto:votre.email@votre-domaine.com'");