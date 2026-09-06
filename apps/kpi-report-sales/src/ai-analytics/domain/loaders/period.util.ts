/**
 * Границы периодов в TZ портала: даты витрины — 'YYYY-MM-DD' по календарю
 * портала (план, 6.2), а выборка транскрипций идёт по UTC-инстантам
 * call_started_at. Здесь — чистые переводы «день портала» → UTC-границы
 * и ключ ISO-недели.
 */
import { isoWeekday, shiftDate } from '@lib/sales-ai-analytics';

type DatePartType = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

/** Смещение TZ относительно UTC (мс) на момент utcDate. */
function tzOffsetMs(utcDate: Date, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).formatToParts(utcDate);
    const read = (type: DatePartType): number =>
        Number(parts.find(part => part.type === type)?.value ?? '0');
    const asUtc = Date.UTC(
        read('year'),
        read('month') - 1,
        read('day'),
        read('hour'),
        read('minute'),
        read('second'),
    );
    return asUtc - utcDate.getTime();
}

/** 00:00:00 дня портала → UTC-инстант. */
export function dayStartUtc(day: string, timeZone: string): Date {
    const naive = new Date(`${day}T00:00:00Z`);
    // Два прохода: смещение на границе перевода часов может отличаться.
    const first = new Date(naive.getTime() - tzOffsetMs(naive, timeZone));
    return new Date(naive.getTime() - tzOffsetMs(first, timeZone));
}

/** 23:59:59.999 дня портала → UTC-инстант. */
export function dayEndUtc(day: string, timeZone: string): Date {
    return new Date(dayStartUtc(shiftDate(day, 1), timeZone).getTime() - 1);
}

/** Понедельник ISO-недели, в которую входит день. */
export function weekMondayOf(day: string): string {
    return shiftDate(day, -(isoWeekday(day) - 1));
}

/** Ключ ISO-недели 'YYYY-Www' (год — ISO-год четверга недели). */
export function isoWeekKey(day: string): string {
    const thursday = shiftDate(day, 4 - isoWeekday(day));
    const thursdayDate = new Date(`${thursday}T00:00:00Z`);
    const isoYear = thursdayDate.getUTCFullYear();
    const yearStart = Date.UTC(isoYear, 0, 1);
    const week = Math.ceil(
        ((thursdayDate.getTime() - yearStart) / 86_400_000 + 1) / 7,
    );
    return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** UTC-границы диапазона дней портала [fromDay; toDay] включительно. */
export function portalRangeUtc(
    fromDay: string,
    toDay: string,
    timeZone: string,
): { from: Date; to: Date } {
    return {
        from: dayStartUtc(fromDay, timeZone),
        to: dayEndUtc(toDay, timeZone),
    };
}

/**
 * Полдень дня портала → UTC-инстант: «момент запуска» для расчётов
 * push-контура по заданной дате (вне границ суток и перевода часов).
 */
export function dayNoonUtc(day: string, timeZone: string): Date {
    return new Date(dayStartUtc(day, timeZone).getTime() + 12 * 3_600_000);
}
