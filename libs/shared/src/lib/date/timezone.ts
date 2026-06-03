import { ETimeZone } from '../utils/date-convert.util';

export { ETimeZone };

/**
 * Соответствие домена Bitrix24 → IANA-таймзона клиента.
 * Источник — legacy `BitrixCallingColdService` (Carbon::createFromFormat … setTimezone).
 * Для не перечисленных доменов используется Europe/Moscow (как в legacy default).
 */
const DOMAIN_TIMEZONE_MAP: Readonly<Record<string, ETimeZone>> = Object.freeze({
    'alfacentr.bitrix24.ru': ETimeZone.ASIA_NOVOSIBIRSK,
    'gsirk.bitrix24.ru': ETimeZone.ASIA_IRKUTSK,
});

const DEFAULT_TIMEZONE: ETimeZone = ETimeZone.EUROPE_MOSCOW;

/**
 * Возвращает IANA-таймзону клиента по домену Bitrix24.
 * Если домен не задан в карте — возвращает Europe/Moscow.
 */
export function resolveTimezoneByDomain(domain: string): ETimeZone {
    return DOMAIN_TIMEZONE_MAP[domain] ?? DEFAULT_TIMEZONE;
}
