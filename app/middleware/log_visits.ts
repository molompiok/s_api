// app/Middleware/LogVisit.ts
import type { HttpContext } from '@adonisjs/core/http'
import Visite from '#models/visite'
import { UAParser } from 'ua-parser-js'
import { v4 } from 'uuid'
import { securityService } from '#services/SecurityService'

export default class LogVisit {
    public async handle({ request, auth, session }: HttpContext, next: () => Promise<void>) {
        // Initialisation du parser pour l'User-Agent
        const parser = new UAParser()
        const ua = request.header('User-Agent') || ''
        const uaResult = parser.setUA(ua).getResult()


        console.log('✨✨✨',session.get('visite_id'));
        
        // Création d'une nouvelle entrée de visite
        const visit = new Visite()


        // 🔐 Authentification ou fallback session
        try {
            const user = await securityService.authenticate({ request, auth })
            visit.user_id = user.id
            visit.is_authenticate = true;
        } catch {
            const visite_id = session.get('visite_id')
            if (visite_id) {
                visit.user_id = visite_id
            } else {
                const user_session = v4()
                session.put('visite_id', user_session)
                visit.user_id = user_session
            }
        }

        session.put('visite_id', visit.user_id)
        visit.ip_address = request.ip()

        const deviceType = uaResult.device.type || 'desktop' // "mobile", "tablet", ou "desktop" par défaut
        visit.device_type = deviceType

        visit.browser_name = uaResult.browser.name || 'unknown'
        visit.browser_version = uaResult.browser.version || 'unknown'

        visit.os_name = uaResult.os.name || 'unknown'
        visit.os_version = uaResult.os.version || 'unknown'

        const referrer = request.header('Referer') || null
        visit.referrer = referrer

        visit.landing_page = request.url() // Chemin uniquement (ex. : "/dashboard")

        await visit.save()

        await next()
    }
}