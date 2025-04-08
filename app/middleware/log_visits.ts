// app/Middleware/LogVisit.ts
import type { HttpContext } from '@adonisjs/core/http'
import Visite from '#models/visite'
import { UAParser } from 'ua-parser-js'
import { v4 } from 'uuid'

export default class LogVisit {
    public async handle({ request, auth, session }: HttpContext, next: () => Promise<void>) {
        // Initialisation du parser pour l'User-Agent
        const parser = new UAParser()
        const ua = request.header('User-Agent') || ''
        const uaResult = parser.setUA(ua).getResult()

        // Création d'une nouvelle entrée de visite
        const visit = new Visite()

        
        // 🔐 Authentification ou fallback session
        try {
            const user = await auth.authenticate()
            visit.user_id = user.id
            visit.is_authenticate = true
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

        visit.ip_address = request.ip()

        const deviceType = uaResult.device.type || 'desktop' // "mobile", "tablet", ou "desktop" par défaut
        visit.device_type = deviceType

        visit.browser = uaResult.browser.name || 'unknown'
        
        visit.os = uaResult.os.name || 'unknown'
        
        const referrer = request.header('Referer') || null
        visit.referrer = referrer
        
        visit.page_url = request.url() // Chemin uniquement (ex. : "/dashboard")
        
        
        await visit.save()

        await next()
    }
}