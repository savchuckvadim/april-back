import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Часовой пояс по умолчанию для отдела сервиса (как в legacy: МСК). */
export const SERVICE_TZ = 'Europe/Moscow';

/** Формат даты-времени для полей Bitrix (как в legacy). */
export const CRM_DATETIME_FORMAT = 'DD.MM.YYYY HH:mm:ss';
/** Краткий формат даты-времени (без секунд). */
export const CRM_DATETIME_SHORT_FORMAT = 'DD.MM.YYYY HH:mm';

/**
 * Возвращает ISO-границы текущего месяца [перваяДата, последняяДата]
 * для фильтра `>=createdTime` / `<=createdTime` в crm.item.list.
 */
export function getFirstLastDayOfMonth(
    now: Date = new Date(),
    tz: string = SERVICE_TZ,
): [string, string] {
    const m = dayjs(now).tz(tz);
    const first = m.startOf('month').format('YYYY-MM-DDT00:00:00');
    const last = m.endOf('month').format('YYYY-MM-DDT23:59:59');
    return [first, last];
}

/** Форматирует дату в формат полей Bitrix. */
export function formatCrmDateTime(
    date: Date,
    tz: string = SERVICE_TZ,
    short = false,
): string {
    return dayjs(date)
        .tz(tz)
        .format(short ? CRM_DATETIME_SHORT_FORMAT : CRM_DATETIME_FORMAT);
}

/**
 * Сравнивает две строковые даты формата `DD.MM.YYYY HH:mm:ss`.
 * `reverse=true` (как в legacy compare_dates с reverse): возвращает более
 * позднюю из дат; при неразборчивых датах — fallback по правилам legacy.
 */
export function compareDates(
    dateLast: string,
    dateNext: string,
    reverse = false,
): string {
    const d1 = dayjs(dateLast, CRM_DATETIME_FORMAT);
    const d2 = dayjs(dateNext, CRM_DATETIME_FORMAT);

    if (!d1.isValid()) {
        return reverse ? dateNext : dateLast;
    }
    if (!d2.isValid()) {
        return dateLast;
    }
    if (!reverse) {
        return d1.isAfter(d2) ? dateLast : dateNext;
    }
    return d1.isBefore(d2) ? dateNext : dateLast;
}
