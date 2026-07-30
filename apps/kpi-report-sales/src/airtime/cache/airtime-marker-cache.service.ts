import { Injectable } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import type { IsoDate, IsoMonth } from '../../shared/lib/month-segments.util';
import type {
    AirtimeDayMarker,
    AirtimeDurationStats,
    AirtimeErrorMarker,
    AirtimeMonthMarker,
    AirtimeTodayBlob,
} from '../types/airtime-statistic.type';
import {
    buildAirtimeDayMarkerKey,
    buildAirtimeDayMarkerMonthPrefix,
    buildAirtimeDurationStatsKey,
    buildAirtimeErrorMarkerKey,
    buildAirtimeMonthMarkerKey,
    buildAirtimeTodayKey,
    buildAirtimeTodayMonthPrefix,
} from './airtime-cache-key.util';
import {
    AIRTIME_CACHE_GROUP_MARKER,
    AIRTIME_CACHE_GROUP_TODAY,
    AIRTIME_DAY_MARKER_TTL_SECONDS,
    AIRTIME_DURATION_MAX_SAMPLES,
    AIRTIME_DURATION_STATS_TTL_SECONDS,
    AIRTIME_ERROR_MARKER_TTL_SECONDS,
    AIRTIME_MONTH_MARKER_TTL_SECONDS,
    AIRTIME_TODAY_TTL_SECONDS,
    AIRTIME_TRUNCATED_MARKER_TTL_SECONDS,
    AirtimeDurationKind,
} from '../constants/airtime-queue.const';
import { AIRTIME_CACHE_APP } from '../constants/airtime.const';

/**
 * Кэш МАРКЕРОВ партиций эфирного времени поверх центрального AppCache
 * (отдельный сервис от AirtimeCacheService с ячейками — одна ответственность).
 *
 * Маркер = «партиция собрана по всему порталу»: месячный m{v}:{yyyy-MM},
 * дневной dm{v}:{yyyy-MM-dd}, живой хвост today{v}:{дата} и error-маркер
 * err{v}:{yyyy-MM} (ОТДЕЛЬНЫЙ ключ: короткоживущая ошибка не должна
 * перетирать долгоживущий ready-маркер). Изоляция порталов — domain в
 * каждом ключе AppCache.
 *
 * Инварианта: TTL маркера всегда МЕНЬШЕ TTL соответствующих ячеек —
 * состояние «маркер жив, ячейки протухли» невозможно (иначе тихие нули).
 */
@Injectable()
export class AirtimeMarkerCacheService {
    constructor(private readonly appCache: AppCacheService) {}

    /** Маркеры месяцев одним MGET. null — партиция не собрана/протухла. */
    async getMonthMarkers(
        domain: string,
        months: readonly IsoMonth[],
    ): Promise<Map<IsoMonth, AirtimeMonthMarker | null>> {
        const markers = await this.appCache.getMany<AirtimeMonthMarker>(
            months.map(month => ({
                app: AIRTIME_CACHE_APP,
                domain,
                key: buildAirtimeMonthMarkerKey(month),
            })),
        );
        return new Map(months.map((month, i) => [month, markers[i]]));
    }

    /**
     * Пишет ready-маркер месяца. Truncated-партиция живёт короткий TTL
     * (пересбор через час), полная — почти как ячейки.
     */
    async setMonthMarker(
        domain: string,
        month: IsoMonth,
        marker: AirtimeMonthMarker,
    ): Promise<void> {
        await this.appCache.set({
            app: AIRTIME_CACHE_APP,
            domain,
            key: buildAirtimeMonthMarkerKey(month),
            group: AIRTIME_CACHE_GROUP_MARKER,
            data: marker,
            ttlSeconds: marker.truncated
                ? AIRTIME_TRUNCATED_MARKER_TTL_SECONDS
                : AIRTIME_MONTH_MARKER_TTL_SECONDS,
        });
    }

    /** Дневные маркеры дат одним MGET. Ключ карты — yyyy-MM-dd. */
    async getDayMarkers(
        domain: string,
        dates: readonly IsoDate[],
    ): Promise<Map<IsoDate, AirtimeDayMarker | null>> {
        const markers = await this.appCache.getMany<AirtimeDayMarker>(
            dates.map(date => ({
                app: AIRTIME_CACHE_APP,
                domain,
                key: buildAirtimeDayMarkerKey(date),
            })),
        );
        return new Map(dates.map((date, i) => [date, markers[i]]));
    }

    /** Пишет дневные маркеры пачкой (truncated → короткий TTL). */
    async setDayMarkers(
        domain: string,
        markers: ReadonlyMap<IsoDate, AirtimeDayMarker>,
    ): Promise<void> {
        if (!markers.size) return;
        await this.appCache.setMany(
            [...markers.entries()].map(([date, marker]) => ({
                app: AIRTIME_CACHE_APP,
                domain,
                key: buildAirtimeDayMarkerKey(date),
                group: AIRTIME_CACHE_GROUP_MARKER,
                data: marker,
                ttlSeconds: marker.truncated
                    ? AIRTIME_TRUNCATED_MARKER_TTL_SECONDS
                    : AIRTIME_DAY_MARKER_TTL_SECONDS,
            })),
        );
    }

    /** Живой хвост «сегодня» (короткий TTL — данные дня ещё меняются). */
    async getTodayBlob(
        domain: string,
        date: IsoDate,
    ): Promise<AirtimeTodayBlob | null> {
        return this.appCache.get<AirtimeTodayBlob>({
            app: AIRTIME_CACHE_APP,
            domain,
            key: buildAirtimeTodayKey(date),
        });
    }

    async setTodayBlob(domain: string, blob: AirtimeTodayBlob): Promise<void> {
        await this.appCache.set({
            app: AIRTIME_CACHE_APP,
            domain,
            key: buildAirtimeTodayKey(blob.date as IsoDate),
            group: AIRTIME_CACHE_GROUP_TODAY,
            data: blob,
            ttlSeconds: AIRTIME_TODAY_TTL_SECONDS,
        });
    }

    /** Error-маркеры месяцев одним MGET (для readiness/поллинга). */
    async getErrorMarkers(
        domain: string,
        months: readonly IsoMonth[],
    ): Promise<Map<IsoMonth, AirtimeErrorMarker | null>> {
        const markers = await this.appCache.getMany<AirtimeErrorMarker>(
            months.map(month => ({
                app: AIRTIME_CACHE_APP,
                domain,
                key: buildAirtimeErrorMarkerKey(month),
            })),
        );
        return new Map(months.map((month, i) => [month, markers[i]]));
    }

    /** Пишет error-маркер месяца (короткий TTL — гасит crash-loop и вечный queued). */
    async setErrorMarker(
        domain: string,
        month: IsoMonth,
        marker: AirtimeErrorMarker,
    ): Promise<void> {
        await this.appCache.set({
            app: AIRTIME_CACHE_APP,
            domain,
            key: buildAirtimeErrorMarkerKey(month),
            group: AIRTIME_CACHE_GROUP_MARKER,
            data: marker,
            ttlSeconds: AIRTIME_ERROR_MARKER_TTL_SECONDS,
        });
    }

    /** Успешный пересбор месяца снимает его error-маркер. */
    async clearErrorMarker(domain: string, month: IsoMonth): Promise<void> {
        await this.appCache.delete({
            app: AIRTIME_CACHE_APP,
            domain,
            key: buildAirtimeErrorMarkerKey(month),
        });
    }

    /** Статистика длительности сбора партиций домена (для оценки ETA). */
    async getDurationStats(
        domain: string,
        kind: AirtimeDurationKind,
    ): Promise<AirtimeDurationStats | null> {
        return this.appCache.get<AirtimeDurationStats>({
            app: AIRTIME_CACHE_APP,
            domain,
            key: buildAirtimeDurationStatsKey(kind),
        });
    }

    /**
     * Обновляет скользящее среднее длительности сбора (кап выборки —
     * адаптивность к изменению объёма портала). Гонки записи не страшны:
     * это эвристика для ETA, не данные отчёта.
     */
    async recordDuration(
        domain: string,
        kind: AirtimeDurationKind,
        elapsedMs: number,
    ): Promise<void> {
        const current = await this.getDurationStats(domain, kind);
        const samples = Math.min(
            (current?.samples ?? 0) + 1,
            AIRTIME_DURATION_MAX_SAMPLES,
        );
        const avgMs = current
            ? (current.avgMs * (samples - 1) + elapsedMs) / samples
            : elapsedMs;
        await this.appCache.set({
            app: AIRTIME_CACHE_APP,
            domain,
            key: buildAirtimeDurationStatsKey(kind),
            group: AIRTIME_CACHE_GROUP_MARKER,
            data: { avgMs: Math.round(avgMs), samples },
            ttlSeconds: AIRTIME_DURATION_STATS_TTL_SECONDS,
        });
    }

    /**
     * Сброс маркеров: month указан — маркеры конкретного месяца (месячный,
     * error, дневные и today по префиксу месяца); без month — все маркеры
     * домена. Вызывается из reset-ручки ВМЕСТЕ со сбросом ячеек: ячейки без
     * маркеров = честный промах, маркеры без ячеек = тихие нули (недопустимо).
     */
    async resetMarkers(domain: string, month?: IsoMonth): Promise<void> {
        const prefixes = month
            ? [
                  buildAirtimeMonthMarkerKey(month),
                  buildAirtimeErrorMarkerKey(month),
                  buildAirtimeDayMarkerMonthPrefix(month),
                  buildAirtimeTodayMonthPrefix(month),
              ]
            : ['m', 'dm', 'today', 'err'];
        for (const keyPrefix of prefixes) {
            await this.appCache.reset({
                app: AIRTIME_CACHE_APP,
                domain,
                keyPrefix,
            });
        }
    }
}
