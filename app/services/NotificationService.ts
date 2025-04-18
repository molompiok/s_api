// Dans s_api/app/services/NotificationService.ts (exemple)
import BullMQService from '#services/BullMQService'
import User from '#models/user' // Le modèle User de s_api
import env from '#start/env';

class NotificationService {
    public async sendWelcomeEmail(user: User) {
        const emailData = {
            to: user.email,
            subject: 'Bienvenue sur Notre Boutique !',
            // template: 'welcome_email', // Optionnel: nom du template
            context: { // Données pour le template
                userName: user.full_name,
                storeId: env.get('STORE_ID') // Envoyer l'ID du store
            }
        };

        try {
            const queue = BullMQService.getServerToServerQueue();
            await queue.add('send_email', {
                event: 'send_email',
                data: emailData
            }, {
                jobId: `sendmail-${user.id}-${Date.now()}` // JobId unique
            });
            console.log(`[NotificationService] Job 'send_email' ajouté pour ${user.email}`);
        } catch (error) {
            console.error(`[NotificationService] Failed to add 'send_email' job for ${user.email}:`, error);
            // Gérer l'erreur (log, monitoring)
        }
    }
}

export default new NotificationService()