import { Logger } from '@nestjs/common';
import { BitrixBaseApi } from '@lib/bitrix';
import {
    enumerateDates,
    IsoDate,
    nextDay,
    prevDay,
} from '../../shared/lib/month-segments.util';
import { AirtimeCacheService } from '../cache/airtime-cache.service';
import { AirtimeMarkerCacheService } from '../cache/airtime-marker-cache.service';
import { AIRTIME_JOB_MAX_ROWS } from '../constants/airtime-queue.const';
import { aggregateRowsToDayCellsAllUsers } from '../lib/airtime-cell.util';
import { monthOfDate, todayIso } from '../lib/airtime-partition.util';
import type {
    AirtimeDayMarker,
    VoximplantAirtimeRow,
} from '../types/airtime-statistic.type';
import {
    buildAirtimeFilter,
    fetchAirtimeRows,
} from '../lib/voximplant-fetch.util';

/**
 * Сбор ДНЕВНОГО диапазона [from..to] по всему порталу: хвост текущего
 * месяца и неполные краевые месяцы периода. Завершённые дни → дневные
 * ячейки + дневные маркеры; сегодня (если входит в диапазон) → живой
 * today-блоб с коротким TTL.
 *
 * «Сегодня» вычисляется в момент ВЫПОЛНЕНИЯ job'а: job, поставленный до
 * полуночи и выполненный после, честно запишет вчерашний день как
 * завершённый (маркер), а блоб не тронет — readiness следующего поллинга
 * сам поставит job на новый день.
 *
 * НЕ Injectable: per-job `new` под конкретный домен.
 */
export class AirtimeDaySpanCollectorUseCase {
    private readonly logger = new Logger(AirtimeDaySpanCollectorUseCase.name);

    constructor(
        private readonly bitrixApi: BitrixBaseApi,
        private readonly cellCache: AirtimeCacheService,
        private readonly markerCache: AirtimeMarkerCacheService,
        private readonly domain: string,
    ) {}

    /**
     * forceRefresh — пересобрать ВСЕ дни диапазона (иначе только дни без
     * маркеров). Дроп страницы → throw (job ретраится).
     */
    async collect(
        from: IsoDate,
        to: IsoDate,
        forceRefresh: boolean,
        now: Date = new Date(),
    ): Promise<{ rowsFetched: number; truncated: boolean }> {
        const today = todayIso(now);
        let rowsFetched = 0;
        let truncated = false;

        const completed = await this.collectCompletedDays(
            from,
            to < today ? to : prevDay(today),
            forceRefresh,
        );
        rowsFetched += completed.rowsFetched;
        truncated = truncated || completed.truncated;

        if (to >= today) {
            const live = await this.collectToday(today);
            rowsFetched += live.rowsFetched;
            truncated = truncated || live.truncated;
        }

        // Успешный сбор снимает error-маркер месяца диапазона.
        await this.markerCache.clearErrorMarker(this.domain, monthOfDate(from));

        if (truncated) {
            this.logger.error(
                `[${this.domain}] диапазон ${from}..${to} обрезан по лимиту ` +
                    `${AIRTIME_JOB_MAX_ROWS} строк — дни помечены truncated`,
            );
        }
        return { rowsFetched, truncated };
    }

    /** Завершённые дни [from..completedTo]: одна выборка промахов, ячейки → маркеры. */
    private async collectCompletedDays(
        from: IsoDate,
        completedTo: IsoDate,
        forceRefresh: boolean,
    ): Promise<{ rowsFetched: number; truncated: boolean }> {
        const days = enumerateDates(from, completedTo);
        const missingDays = forceRefresh
            ? days
            : await this.filterUnmarkedDays(days);
        if (!missingDays.length) {
            return { rowsFetched: 0, truncated: false };
        }

        // Одна выборка [первый промах .. последний промах]: дни между
        // промахами перезапишутся идемпотентно.
        const fetchFrom = missingDays[0];
        const fetchTo = missingDays[missingDays.length - 1];
        const { rows, truncated } = await fetchAirtimeRows(
            this.bitrixApi,
            buildAirtimeFilter(undefined, fetchFrom, nextDay(fetchTo)),
            AIRTIME_JOB_MAX_ROWS,
            this.logger,
        );

        const fetchedDays = enumerateDates(fetchFrom, fetchTo);
        const cells = aggregateRowsToDayCellsAllUsers(rows, fetchedDays);
        await this.cellCache.setDayCells(this.domain, cells);
        await this.markerCache.setDayMarkers(
            this.domain,
            buildDayMarkers(fetchedDays, rows, truncated),
        );
        return { rowsFetched: rows.length, truncated };
    }

    /** Живой хвост «сегодня» — портал-wide блоб с коротким TTL. */
    private async collectToday(
        today: IsoDate,
    ): Promise<{ rowsFetched: number; truncated: boolean }> {
        const { rows, truncated } = await fetchAirtimeRows(
            this.bitrixApi,
            buildAirtimeFilter(undefined, today, nextDay(today)),
            AIRTIME_JOB_MAX_ROWS,
            this.logger,
        );

        const cells = aggregateRowsToDayCellsAllUsers(rows, [today]);
        await this.markerCache.setTodayBlob(this.domain, {
            date: today,
            cells: Object.fromEntries(
                [...cells.entries()].map(([pair, cell]) => [
                    pair.split('|')[0],
                    cell,
                ]),
            ),
            rowsFetched: rows.length,
            truncated,
            computedAt: new Date().toISOString(),
        });
        return { rowsFetched: rows.length, truncated };
    }

    private async filterUnmarkedDays(days: IsoDate[]): Promise<IsoDate[]> {
        if (!days.length) return [];
        const markers = await this.markerCache.getDayMarkers(this.domain, days);
        return days.filter(day => !markers.get(day));
    }
}

/** Маркеры дней выборки: rowsFetched — строк статистики за конкретный день. */
function buildDayMarkers(
    days: readonly IsoDate[],
    rows: readonly VoximplantAirtimeRow[],
    truncated: boolean,
): Map<IsoDate, AirtimeDayMarker> {
    const rowsPerDay = new Map<IsoDate, number>();
    for (const day of days) rowsPerDay.set(day, 0);
    for (const row of rows) {
        const day = String(row.CALL_START_DATE ?? '').slice(0, 10) as IsoDate;
        if (rowsPerDay.has(day)) {
            rowsPerDay.set(day, (rowsPerDay.get(day) ?? 0) + 1);
        }
    }
    return new Map(
        days.map(day => [
            day,
            { truncated, rowsFetched: rowsPerDay.get(day) ?? 0 },
        ]),
    );
}
