import type { IsoDate, IsoMonth } from '../../shared/lib/month-segments.util';
import { AIRTIME_PARTITION_VERSION } from '../constants/airtime-queue.const';

/**
 * Типизированные ключи ячеек и маркеров эфирного времени в AppCache.
 *
 * Месячная ячейка: key='u{userId}:{yyyy-MM}' — полные прошлые месяцы.
 * Дневная ячейка:  key='u{userId}:d{yyyy-MM-dd}' — прошедшие дни текущего
 * или краевого месяца. В redis разворачивается в
 * `app-cache:airtime:{domain}:0:{key}` — domain зашит в каждый ключ
 * центральным AppCache (изоляция порталов: userId уникален только
 * внутри портала).
 *
 * Маркеры партиций (очередь): 'm{v}:{yyyy-MM}' — месяц собран портал-wide;
 * 'dm{v}:{yyyy-MM-dd}' — день собран; 'today{v}:{yyyy-MM-dd}' — живой хвост
 * сегодня; 'err{v}:{yyyy-MM}' — job месяца окончательно упал (отдельный
 * ключ, чтобы короткоживущий error НИКОГДА не перетирал долгоживущий
 * ready-маркер). Цифра версии в ключе = дешёвая инвалидация формата.
 *
 * ИНВАРИАНТА для сбросов: ключ месячного маркера оканчивается на ':{yyyy-MM}'
 * (как и месячные ячейки) — сброс месяца по keySuffix задевает и его;
 * дневные маркеры сбрасываются по keyPrefix 'dm{v}:{yyyy-MM}'.
 */
export type AirtimeCellKey = `u${number}:${IsoMonth}`;
export type AirtimeDayKey = `u${number}:d${IsoDate}`;
export type AirtimeMonthMarkerKey = `m${number}:${IsoMonth}`;
export type AirtimeDayMarkerKey = `dm${number}:${IsoDate}`;
export type AirtimeTodayKey = `today${number}:${IsoDate}`;
export type AirtimeErrorMarkerKey = `err${number}:${IsoMonth}`;

export const buildAirtimeCellKey = (
    userId: number,
    month: IsoMonth,
): AirtimeCellKey => `u${userId}:${month}`;

export const buildAirtimeDayKey = (
    userId: number,
    date: IsoDate,
): AirtimeDayKey => `u${userId}:d${date}`;

export const buildAirtimeMonthMarkerKey = (
    month: IsoMonth,
): AirtimeMonthMarkerKey => `m${AIRTIME_PARTITION_VERSION}:${month}`;

export const buildAirtimeDayMarkerKey = (date: IsoDate): AirtimeDayMarkerKey =>
    `dm${AIRTIME_PARTITION_VERSION}:${date}`;

export const buildAirtimeTodayKey = (date: IsoDate): AirtimeTodayKey =>
    `today${AIRTIME_PARTITION_VERSION}:${date}`;

export const buildAirtimeErrorMarkerKey = (
    month: IsoMonth,
): AirtimeErrorMarkerKey => `err${AIRTIME_PARTITION_VERSION}:${month}`;

/** Префикс дневных маркеров месяца — для сброса keyPrefix'ом. */
export const buildAirtimeDayMarkerMonthPrefix = (month: IsoMonth): string =>
    `dm${AIRTIME_PARTITION_VERSION}:${month}`;

/** Префикс today-блобов месяца — для сброса keyPrefix'ом. */
export const buildAirtimeTodayMonthPrefix = (month: IsoMonth): string =>
    `today${AIRTIME_PARTITION_VERSION}:${month}`;

/** Ключ статистики длительности сбора партиций (для оценки ETA). */
export const buildAirtimeDurationStatsKey = (kind: string): string =>
    `stat${AIRTIME_PARTITION_VERSION}:dur:${kind}`;
