//app/utils/functions.ts
import i18nService from '@adonisjs/i18n/services/main'
import logger from '@adonisjs/core/services/logger'
import { objectToFlatArray } from 'bullmq'

/**
 * Fonction de traduction globale (pour usage hors contexte HttpContext si nécessaire).
 * Préférer ctx.i18n.formatMessage dans les contrôleurs/middlewares.
 *
 * @param key Clé de traduction
 * @param data Données d'interpolation (optionnel)
 * @param locale Locale à utiliser (défaut: locale courante ou fallback) (optionnel)
 * @returns Message traduit
 */
export function t(key: string, data?: Record<string, any>, locale?: string): string {
    const targetLocale = locale || 'fr'
    try {
        return i18nService.locale(targetLocale).formatMessage(key, data)
    } catch (error) {
        return key // Retourne la clé en cas d'erreur
    }
}

/**
 * @param data L'objet contenant les données (ex: request.all())
 * @param key La clé du champ à normaliser.
 * @returns Un string[] si l'entrée est valide, sinon null.
 */
export function normalizeStringArrayInput<T extends Record<string, any>>(data: T) {

    const dataParsed: Record<string, any> = {}
    // Déjà un tableau ?
    for (const [key, value] of Object.entries(data)) {
        if (!Array.isArray(value) && typeof value === 'string') {
            try {
                const parsed = JSON.parse(value)
                if (Array.isArray(parsed)) {
                    dataParsed[key] = parsed
                }
            } catch (error) {
                throw new Error(t('invalid_value',{key,value}))
            }
        }else{
            throw new Error(t('invalid_value',{key,value}))
        }
    }
    return dataParsed as {
        [key in keyof T]:string[]
    }

}








