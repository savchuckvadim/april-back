import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { ETimeZone } from '@lib/shared/lib/date';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * КАЛЕНДАРЬ АУДИТА СДЕЛОК — чистые функции: когда прогонять портал.
 *
 * Решение владельца (05.10.2026): аудит идёт раз в неделю или раз в месяц и
 * только в НЕРАБОЧЕЕ время — в ночь на понедельник либо в ночь на первое
 * число. Раньше портал аудировался «раз в N минут от прошлого прогона»:
 * старт каждый день сползал на полчаса и рано или поздно приходился на
 * разгар рабочего дня — сотни запросов подряд в общий лимит Битрикса.
 *
 * Всё считается В ТАЙМЗОНЕ ПОРТАЛА: сервер живёт в UTC, а «ночь на
 * понедельник» у клиента своя.
 */

/** Как часто аудировать портал. */
export const DEAL_AUDIT_FREQUENCY = {
    weekly: 'weekly',
    monthly: 'monthly',
} as const;

export type DealAuditFrequency =
    (typeof DEAL_AUDIT_FREQUENCY)[keyof typeof DEAL_AUDIT_FREQUENCY];

export const DEAL_AUDIT_DEFAULT_FREQUENCY: DealAuditFrequency =
    DEAL_AUDIT_FREQUENCY.weekly;

/** Русское название частоты — для отчётов крона. */
export const DEAL_AUDIT_FREQUENCY_LABEL: Record<DealAuditFrequency, string> = {
    [DEAL_AUDIT_FREQUENCY.weekly]: 'раз в неделю, в ночь на понедельник',
    [DEAL_AUDIT_FREQUENCY.monthly]: 'раз в месяц, в ночь на первое число',
};

/** Значение настройки → частота; пустое и незнакомое — раз в неделю. */
export const parseDealAuditFrequency = (raw: unknown): DealAuditFrequency =>
    raw === DEAL_AUDIT_FREQUENCY.monthly
        ? DEAL_AUDIT_FREQUENCY.monthly
        : DEAL_AUDIT_DEFAULT_FREQUENCY;

/**
 * Ночное окно прогона по часам портала: с 01:00 до 06:00. К часу ночи
 * отработали вечерние кроны, к шести утра до первых менеджеров ещё далеко.
 */
export const DEAL_AUDIT_NIGHT_FROM_HOUR = 1;
export const DEAL_AUDIT_NIGHT_TO_HOUR = 6;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Календарный день портала как полночь UTC — арифметика дат без сдвигов TZ. */
const localDayUtc = (now: Date, tz: ETimeZone): number => {
    const local = dayjs(now).tz(tz);
    return Date.UTC(local.year(), local.month(), local.date());
};

/** ISO-день недели дня `dayUtc`: 1 — понедельник … 7 — воскресенье. */
const isoWeekdayOf = (dayUtc: number): number =>
    ((new Date(dayUtc).getUTCDay() + 6) % 7) + 1;

/**
 * Ключ периода, за который положен ОДИН прогон: неделя — её понедельник
 * («w:2026-10-05»), месяц — «m:2026-10». По ключу крон помнит, что период
 * уже отработан.
 */
export const dealAuditPeriodKey = (
    now: Date,
    tz: ETimeZone,
    frequency: DealAuditFrequency,
): string => {
    const day = localDayUtc(now, tz);
    if (frequency === DEAL_AUDIT_FREQUENCY.monthly) {
        return `m:${new Date(day).toISOString().slice(0, 7)}`;
    }
    const monday = day - (isoWeekdayOf(day) - 1) * DAY_MS;
    return `w:${new Date(monday).toISOString().slice(0, 10)}`;
};

/** Сейчас у портала ночное окно — днём аудит не запускается никогда. */
export const isDealAuditNight = (now: Date, tz: ETimeZone): boolean => {
    const hour = dayjs(now).tz(tz).hour();
    return (
        hour >= DEAL_AUDIT_NIGHT_FROM_HOUR && hour < DEAL_AUDIT_NIGHT_TO_HOUR
    );
};

/**
 * Пора ли прогонять портал.
 *
 * Да — когда у портала ночь и текущий период ещё не отработан. Период
 * начинается в понедельник (или первого числа), поэтому первый же ночной
 * тик нового периода — это и есть «ночь на понедельник». Если в ту ночь
 * сервер лежал или аудит включили в среду — прогон уйдёт в ближайшую
 * ночь, а не через неделю; но всегда ночью.
 */
export const isDealAuditDue = (input: {
    now: Date;
    tz: ETimeZone;
    frequency: DealAuditFrequency;
    /** Ключ периода последнего прогона; null — портал ещё не аудировался. */
    lastPeriodKey: string | null;
}): boolean => {
    const { now, tz, frequency, lastPeriodKey } = input;
    if (!isDealAuditNight(now, tz)) return false;
    return dealAuditPeriodKey(now, tz, frequency) !== lastPeriodKey;
};
