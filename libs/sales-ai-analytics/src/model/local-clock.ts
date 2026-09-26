/**
 * Локальное время портала для кронов (план Фазы 3, П10 «p3-tz-crons»):
 * контейнер живёт в UTC, тик крона — ежечасный на минуте слота, а «пора
 * ли» решается по часам портала. Поднято из приложения в библиотеку
 * (25.09.2026), чтобы крон ретенции админ-модуля считал локальный час
 * теми же правилами, что и кроны витрины.
 *
 * Правило попадания (`isLocalHour`): слот наступил в течение последнего
 * часа по локальному времени — 0 ≤ (минуты суток портала − минуты слота)
 * < 60, плюс день недели и число месяца, если слот их задаёт. Для поясов
 * с целым смещением (вся РФ и СНГ) это точное совпадение hh:mm; для
 * дробных (+5:30 и т.п.) джоба уходит первым тиком ПОСЛЕ слота — никогда
 * раньше. Запоздавший на минуту тик слот не теряет.
 *
 * Чистые функции без состояния: время всегда параметром, не `new Date()`.
 */
import { DEFAULT_WORK_CALENDAR } from './workdays.util';

/**
 * Слот локального времени портала: час и минута, при необходимости день
 * недели ISO (1 — понедельник … 7 — воскресенье) и число месяца.
 */
export interface AiLocalSlot {
    hour: number;
    minute: number;
    weekday?: number;
    dayOfMonth?: number;
}

/** Часы портала в момент тика: дата, время и календарные признаки. */
export interface AiLocalClock {
    /** Локальная дата YYYY-MM-DD (как toPortalDate). */
    date: string;
    /** Локальное время HH:MM — для jobId не нужно, для логов тика — да. */
    time: string;
    hour: number;
    minute: number;
    /** День недели ISO: 1 — понедельник … 7 — воскресенье. */
    weekday: number;
    dayOfMonth: number;
}

const MINUTES_PER_HOUR = 60;
/** Короткие имена дней en-US в порядке ISO (индекс + 1 = день недели). */
const WEEKDAY_SHORT_NAMES: readonly string[] = [
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
];
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Форматтер пояса (кэш по имени); неизвестный пояс — RangeError от ICU. */
function formatterFor(timeZone: string): Intl.DateTimeFormat {
    const cached = formatters.get(timeZone);
    if (cached) return cached;
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
    });
    formatters.set(timeZone, formatter);
    return formatter;
}

/** IANA-пояс портала или Europe/Moscow, если пояс пуст или неизвестен ICU. */
export function resolveTimeZone(timeZone: string | null | undefined): string {
    if (!timeZone) return DEFAULT_WORK_CALENDAR.timeZone;
    try {
        formatterFor(timeZone);
        return timeZone;
    } catch {
        return DEFAULT_WORK_CALENDAR.timeZone;
    }
}

/** Часы портала в момент `now`; пояс без настройки или битый — Europe/Moscow. */
export function localClock(
    now: Date,
    timeZone: string | null | undefined,
): AiLocalClock {
    const parts = formatterFor(resolveTimeZone(timeZone)).formatToParts(now);
    const pick = (type: Intl.DateTimeFormatPartTypes): string =>
        parts.find(part => part.type === type)?.value ?? '';
    return {
        date: `${pick('year')}-${pick('month')}-${pick('day')}`,
        time: `${pick('hour')}:${pick('minute')}`,
        hour: Number(pick('hour')),
        minute: Number(pick('minute')),
        weekday: WEEKDAY_SHORT_NAMES.indexOf(pick('weekday')) + 1,
        dayOfMonth: Number(pick('day')),
    };
}

/** Час суток в TZ портала (0–23); историческое имя окна backfill. */
export function portalHour(now: Date, timeZone: string): number {
    return localClock(now, timeZone).hour;
}

/**
 * Часы портала, если слот наступил в последний час, иначе null: одной
 * проверкой планировщик и решает «пора», и получает дату для jobId и
 * время для строки лога.
 */
export function dueLocalClock(
    now: Date,
    timeZone: string | null | undefined,
    slot: AiLocalSlot,
): AiLocalClock | null {
    const clock = localClock(now, timeZone);
    if (slot.weekday !== undefined && clock.weekday !== slot.weekday) {
        return null;
    }
    if (slot.dayOfMonth !== undefined && clock.dayOfMonth !== slot.dayOfMonth) {
        return null;
    }
    const elapsed =
        clock.hour * MINUTES_PER_HOUR +
        clock.minute -
        (slot.hour * MINUTES_PER_HOUR + slot.minute);
    return elapsed >= 0 && elapsed < MINUTES_PER_HOUR ? clock : null;
}

/** Наступил ли слот локального времени портала в последний час (см. шапку). */
export function isLocalHour(
    now: Date,
    timeZone: string | null | undefined,
    slot: AiLocalSlot,
): boolean {
    return dueLocalClock(now, timeZone, slot) !== null;
}

/** Ежечасный тик крона на минуте слота; локальный час проверяет планировщик. */
export function hourlyTickCron(slot: AiLocalSlot): string {
    return `${slot.minute} * * * *`;
}
