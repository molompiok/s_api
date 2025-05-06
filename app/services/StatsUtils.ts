// app/services/StatsUtils.ts
import logger from '@adonisjs/core/services/logger';
import { DateTime } from 'luxon';

export type StatsPeriod = 'day' | 'week' | 'month'; // Ajouter 'hour' si besoin?

// Valeurs par défaut pour count si non fourni
const defaultCounts: Record<StatsPeriod, number> = {
    day: 7,
    week: 4,
    month: 12,
};

/**
 * Calcule les dates de début et de fin pour une requête de statistiques.
 * @param period - Résolution (jour, semaine, mois).
 * @param startAtIso - Date de fin (ISO string), défaut à maintenant.
 * @param count - Nombre de périodes à inclure en arrière.
 * @returns Objet avec startDate et endDate (instances Luxon DateTime).
 */export function calculateDateRange(
    period: StatsPeriod,
    start_at?: string, // ISO Date string
    count?: number,
    end_at?: string // ISO Date string
): { startDate: DateTime; endDate: DateTime } {

    // Utilise le count fourni ou la valeur par défaut pour la période
    const resolvedCount = count ?? defaultCounts[period];

    let startDate: DateTime;
    let endDate: DateTime;

    // Tenter de parser les dates fournies
    const parsedStart = start_at ? DateTime.fromISO(start_at) : null;
    const parsedEnd = end_at ? DateTime.fromISO(end_at) : null;

    // --- Appliquer la logique de priorité ---

    // Cas 1: Plage fixe (start_at et end_at sont valides)
    if (parsedStart?.isValid && parsedEnd?.isValid) {
        startDate = parsedStart;
        endDate = parsedEnd;
        logger.debug({ start_at, end_at, period }, 'StatsUtils: Calculated date range: Fixed window from start_at to end_at');
    }
    // Cas 2: Fenêtre se terminant à end_at (seulement end_at valide)
    else if (parsedEnd?.isValid) {
        endDate = parsedEnd;
        startDate = endDate.minus({ [period]: resolvedCount - 1 });
        logger.debug({ end_at, resolvedCount, period }, `StatsUtils: Calculated date range: Window ending at end_at, going back ${resolvedCount} ${period}s`);
    }
     // Cas 3: Fenêtre commençant à start_at (seulement start_at valide)
     // Calcule la date de fin en avançant de 'resolvedCount - 1' périodes à partir de start_at.
     else if (parsedStart?.isValid) {
        startDate = parsedStart;
        endDate = startDate.plus({ [period]: resolvedCount - 1 });
        logger.debug({ start_at, resolvedCount, period }, `StatsUtils: Calculated date range: Window starting at start_at, going forward ${resolvedCount} ${period}s`);
     }
    // Cas 4: Fenêtre par défaut se terminant maintenant (ni start_at ni end_at valides)
    else {
        endDate = DateTime.now();
        startDate = endDate.minus({ [period]: resolvedCount - 1 });
        logger.debug({ resolvedCount, period }, `StatsUtils: Calculated date range: Default window ending now, going back ${resolvedCount} ${period}s`);
    }

    // --- Vérification de la validité après calcul ---
    // Si les paramètres d'entrée étaient invalides et n'ont pas été utilisés dans les cas 1-3,
    // le fallback au cas 4 devrait produire des dates valides.
    // Cependant, si les calculs (minus/plus) échouent pour une raison bizarre, cette vérification est utile.
    if (!startDate.isValid) {
         logger.error({ start_at, end_at, period, count, calculatedStartDate: startDate.toISO() }, 'StatsUtils: Calculated startDate is invalid.');
         // Lever une erreur pour indiquer un problème non récupérable
         throw new Error(`Invalid date parameters provided or calculation resulted in an invalid start date. Input: start_at=${start_at}, end_at=${end_at}, period=${period}, count=${count}.`);
    }
     if (!endDate.isValid) {
         logger.error({ start_at, end_at, period, count, calculatedEndDate: endDate.toISO() }, 'StatsUtils: Calculated endDate is invalid.');
         // Lever une erreur pour indiquer un problème non récupérable
         throw new Error(`Invalid date parameters provided or calculation resulted in an invalid end date. Input: start_at=${start_at}, end_at=${end_at}, period=${period}, count=${count}.`);
     }


    // --- Ajuster les dates aux bornes de la période ---
    // S'assurer que la date de début est bien au début de la période (ex: 00:00 pour un jour, 1er jour du mois)
    // S'assurer que la date de fin est bien à la fin de la période (ex: 23:59:59 pour un jour, dernier jour du mois)
    const finalStartDate = startDate.startOf(period);
    const finalEndDate = endDate.endOf(period);

    // Log les dates finales pour le débogage
    logger.debug({ finalStartDate: finalStartDate.toISO(), finalEndDate: finalEndDate.toISO(), period, resolvedCount }, "StatsUtils: Final date range after start/end of period adjustment");


    return { startDate: finalStartDate, endDate: finalEndDate };
}

/**
 * Retourne le format SQL pour DATE_TRUNC ou équivalent basé sur la période.
 * @param period - 'day', 'week', 'month'.
 * @returns String de format SQL.
 */
export function getGroupFormatSQL(period: StatsPeriod): string {
     // Utiliser DATE_TRUNC (standard, marche sur PostgreSQL)
     // Adapter pour d'autres SGBD si nécessaire
    switch (period) {
        case 'day':
            return "DATE_TRUNC('day', created_at)"; // Tronque à la journée
        case 'week':
            // DATE_TRUNC 'week' commence le lundi. Utiliser 'isoyear-week' ?
            return "DATE_TRUNC('week', created_at)"; // Tronque à la semaine (Lundi)
        case 'month':
            return "DATE_TRUNC('month', created_at)"; // Tronque au mois
        default:
             logger.error(`Invalid period received in getGroupFormatSQL: ${period}`);
            throw new Error('Invalid period for grouping');
    }
     // Alternative avec to_char (moins performant pour group by?)
    // switch (period) {
    //   case 'day': return "to_char(created_at, 'YYYY-MM-DD')";
    //   case 'week': return "to_char(created_at, 'IYYY-IW')"; // ISO Week
    //   case 'month': return "to_char(created_at, 'YYYY-MM')";
    // }
}

/**
 * Construit la clause WHERE pour les requêtes de statistiques.
 */
export function buildStatsWhereClause(params: {
    startDate: DateTime;
    endDate: DateTime;
    userId?: string;
    productId?: string; // Pour commandes
    ipAddress?: string; // Pour visites
}): { clause: string; bindings: any[] } {
    const filters: string[] = [];
    const bindings: any[] = [];

    // Toujours appliquer la plage de dates
    filters.push(`created_at >= ?`);
    bindings.push(params.startDate.toISO()); // Utiliser ISO string pour binding
    filters.push(`created_at <= ?`);
    bindings.push(params.endDate.toISO()); // Utiliser ISO string pour binding


    if (params.userId) {
        filters.push(`user_id = ?`);
        bindings.push(params.userId);
    }
    if (params.productId) {
         // Assurer que la table est bien user_orders pour EXISTS
         filters.push(`EXISTS (SELECT 1 FROM user_order_items WHERE user_order_items.order_id = user_orders.id AND user_order_items.product_id = ?)`);
        bindings.push(params.productId);
    }
     if (params.ipAddress) {
        filters.push(`ip_address = ?`);
        bindings.push(params.ipAddress);
    }
    // Ajouter d'autres filtres communs ici si nécessaire

    const clause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    return { clause, bindings };
}

/**
 * Construit la map de résultats pour une dimension spécifique (ex: browser, status).
 */
export function buildFieldStatsMap(rows: any[], dateField: string = 'date', keyField: string, countField: string = 'count'): Record<string, Record<string, number>> {
    const map: Record<string, Record<string, number>> = {};

    for (const row of rows) {
         const dateValue = row[dateField];
         // Formater la date en YYYY-MM-DD ou YYYY-MM etc. pour la clé de l'objet
         const dateKey = DateTime.fromJSDate(dateValue).toFormat(dateField === getGroupFormatSQL('month') ? 'yyyy-MM' : 'yyyy-MM-dd');

        const key = row[keyField];
        if (!key) continue; // Ignorer clés nulles

        if (!map[dateKey]) {
            map[dateKey] = {};
        }
        map[dateKey][key] = Number(row[countField] || 0);
    }
    return map;
}

/**
 * Génère le SQL pour récupérer les stats groupées par date et une dimension.
 */
export function generateDimensionStatSQL(
    groupFormatSQL: string,
    dimensionField: string,
    tableName: string, // 'visites' ou 'user_orders'
    whereClause: string
): string {
    // Assurer que le champ de dimension est safe (éviter injection SQL)
    const safeDimensionField = dimensionField.replace(/[^a-zA-Z0-9_]/g, ''); // Simple nettoyage
    if (!safeDimensionField) throw new Error(`Invalid dimension field: ${dimensionField}`);

    return `
      SELECT
        ${groupFormatSQL} AS date,
        ${safeDimensionField},
        COUNT(*) AS count
      FROM ${tableName}
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} ${safeDimensionField} IS NOT NULL -- Exclure nulls pour la dimension
      GROUP BY date, ${safeDimensionField}
      ORDER BY date
    `;
}