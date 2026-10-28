/**
 * Месяцы для сводки догона: какие закрытые месяцы кнопка «Догнать
 * историю» должна была посчитать и каких в журнале нет — владелец видит
 * не только «18 из 24», но и чего именно не хватает (gsr 28.10.2026).
 */
import { shiftMonthKey } from '../../model/trend/same-period';
import { toPortalDate } from '../../model/workdays.util';

/** Сколько недостающих месяцев перечисляем словами, остальные — «и ещё N». */
export const MISSING_MONTHS_SHOWN = 6;

/**
 * `count` закрытых месяцев перед месяцем «сегодня» в поясе портала, от
 * старых к свежим — то же окно, что берёт кнопка (прошлый месяц включительно).
 */
export function closedMonthKeys(
    now: Date,
    timeZone: string,
    count: number,
): string[] {
    const current = toPortalDate(now, timeZone).slice(0, 7);
    const months: string[] = [];
    for (let lag = count; lag >= 1; lag -= 1) {
        const key = shiftMonthKey(current, lag);
        if (key !== null) months.push(key);
    }
    return months;
}

/** «2026-04, 2026-05 и ещё 3» — каких месяцев не хватает; пусто — ''. */
export function missingMonthsText(missing: readonly string[]): string {
    const shown = missing.slice(0, MISSING_MONTHS_SHOWN).join(', ');
    const more = missing.length - MISSING_MONTHS_SHOWN;
    return more > 0 ? `${shown} и ещё ${more}` : shown;
}
