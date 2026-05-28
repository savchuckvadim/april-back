import { ETimeZone } from './timezone';
import { parsePortalInput } from './parse-portal-input';

/**
 * Форматирует дату в человекочитаемую строку «26 мая 2026» (без слова «г.»),
 * в TZ портала.
 *
 * Используется в legacy для составления заголовка task/смарт-сущности
 * (`'от ' . $formattedStringNowDate`, IntlDateFormatter ru_RU 'd MMMM yyyy').
 */
export function toRuHumanDate(raw: string, portalTz: ETimeZone): string {
    const portalLocal = parsePortalInput(raw, portalTz).tz(portalTz);
    const formatted = new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: portalTz,
    }).format(portalLocal.toDate());
    return formatted.replace(/\s*г\.?\s*$/u, '').trim();
}
