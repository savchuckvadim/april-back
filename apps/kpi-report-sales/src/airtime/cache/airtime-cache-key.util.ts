import type { IsoMonth } from '../../shared/lib/month-segments.util';

/**
 * Типизированные ключи месячных ячеек эфирного времени в AppCache.
 *
 * Полный адрес ячейки: app='airtime', domain портала, key='u{userId}:{yyyy-MM}'.
 * В redis это разворачивается в `app-cache:airtime:{domain}:0:u{userId}:{yyyy-MM}`
 * (см. libs/app-cache/lib/cache-key.util.ts) — читаемо в redis-cli.
 */
export type AirtimeCellKey = `u${number}:${IsoMonth}`;

export const buildAirtimeCellKey = (
    userId: number,
    month: IsoMonth,
): AirtimeCellKey => `u${userId}:${month}`;
