import { ETimeZone } from './timezone';
import { parsePortalInput } from './parse-portal-input';

const CRM_DATETIME_FORMAT = 'DD.MM.YYYY HH:mm:ss';

/**
 * Готовит значение для CRM datetime-полей (UF_CRM_*, ufCrm*) сущностей/смартов/сделок.
 *
 * Bitrix CRM datetime-поле сохраняет переданную строку как локальное время портала
 * (без интерпретации TZ). Legacy писал `$deadline` в эти поля без конвертации
 * (см. BitrixCallingColdService.__construct, ветки 'xo_date' / 'call_next_date').
 *
 * Здесь нормализуем формат: вне зависимости от того, как deadline пришёл с фронта
 * (ISO, `dd.mm.yyyy`, без секунд), на выходе строго `DD.MM.YYYY HH:mm:ss` в TZ портала.
 */
export function toCrmDateTime(raw: string, portalTz: ETimeZone): string {
    return parsePortalInput(raw, portalTz)
        .tz(portalTz)
        .format(CRM_DATETIME_FORMAT);
}
