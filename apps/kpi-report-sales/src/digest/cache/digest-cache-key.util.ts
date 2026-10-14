/**
 * Детерминированные ключи кэша/jobId дневного дайджеста.
 *
 * Партиции дня (события, план на день, звонки) НЕ зависят от состава
 * сотрудников — собираются по всему порталу; domain в ключ добавляет
 * сам AppCache. Конверт результата и jobId зависят от выборки
 * (usersKey), как у kpi-report.
 */
import type { IsoDate } from '../../shared/lib/month-segments.util';
import { KPI_DIGEST_CACHE_VERSION } from '../constants/digest.const';

const V = KPI_DIGEST_CACHE_VERSION;

/** Партиция событий дня (записи списка sales_kpi по всему порталу). */
export const buildDigestDayKey = (date: IsoDate): string => `${V}:day:${date}`;

/** Партиция «запланировано на начало дня». */
export const buildDigestPlannedKey = (date: IsoDate): string =>
    `${V}:planned:${date}`;

/** Партиция фактических звонков дня. */
export const buildDigestCallsKey = (date: IsoDate): string =>
    `${V}:calls:${date}`;

/** Конверт результата по выборке сотрудников. */
export const buildDigestResultKey = (date: IsoDate, usersKey: string): string =>
    `${V}:result:${date}:${usersKey}`;

export const buildDigestJobId = (
    domain: string,
    date: IsoDate,
    usersKey: string,
): string => `digest:${V}:${domain}:${date}:${usersKey}`;

/**
 * Эхо-ключ запроса для фронта: формат отчёта `${from}|${to}|${usersKey}`
 * с префиксом вида периода — ключ однозначен и для будущих видов.
 */
export const buildDigestRequestKey = (date: IsoDate, usersKey: string): string =>
    `day|${date}|${date}|${usersKey}`;

/** Префикс ключей всех партиций одного дня — для точечного сброса. */
export const buildDigestDayKeyPrefixes = (date: IsoDate): string[] => [
    buildDigestDayKey(date),
    buildDigestPlannedKey(date),
    buildDigestCallsKey(date),
    `${V}:result:${date}:`,
];
