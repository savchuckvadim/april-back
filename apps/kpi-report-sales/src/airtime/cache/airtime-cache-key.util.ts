import type { IsoDate, IsoMonth } from '../../shared/lib/month-segments.util';

/**
 * Типизированные ключи ячеек эфирного времени в AppCache.
 *
 * Месячная ячейка: key='u{userId}:{yyyy-MM}' — полные прошлые месяцы.
 * Дневная ячейка:  key='u{userId}:d{yyyy-MM-dd}' — прошедшие дни ТЕКУЩЕГО
 * месяца (сегодня всегда живьём). В redis разворачивается в
 * `app-cache:airtime:{domain}:0:{key}` — читаемо в redis-cli.
 */
export type AirtimeCellKey = `u${number}:${IsoMonth}`;
export type AirtimeDayKey = `u${number}:d${IsoDate}`;

export const buildAirtimeCellKey = (
    userId: number,
    month: IsoMonth,
): AirtimeCellKey => `u${userId}:${month}`;

export const buildAirtimeDayKey = (
    userId: number,
    date: IsoDate,
): AirtimeDayKey => `u${userId}:d${date}`;
