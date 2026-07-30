import { Injectable } from '@nestjs/common';
import {
    enumerateDates,
    IsoDate,
    IsoMonth,
} from '../../shared/lib/month-segments.util';
import { AirtimeCacheService } from '../cache/airtime-cache.service';
import { AirtimeMarkerCacheService } from '../cache/airtime-marker-cache.service';
import {
    AIRTIME_ETA_DEFAULT_SECONDS,
    AirtimeMonthStatus,
} from '../constants/airtime-queue.const';
import {
    addCellInto,
    cellsToUserResults,
    emptyAirtimeCell,
    parseDepartamentUserIds,
} from '../lib/airtime-cell.util';
import {
    AirtimePartitionUnit,
    AirtimeSpanUnit,
    buildPartitionUnits,
    spanCompletedRange,
    todayIso,
} from '../lib/airtime-partition.util';
import type {
    AirtimeMonthCell,
    AirtimeTodayBlob,
    IAirtimeStatisticResult,
    IAirtimeUser,
} from '../types/airtime-statistic.type';

/** Готовность одного партиционного юнита. */
export interface AirtimeUnitReadiness {
    unit: AirtimePartitionUnit;
    status: AirtimeMonthStatus;
    /** Метаданные готового юнита (для Σ rowsFetched / OR truncated). */
    rowsFetched: number;
    truncated: boolean;
    /** Живой блоб сегодняшнего дня span-юнита (чтобы не читать дважды). */
    todayBlob: AirtimeTodayBlob | null;
    /** Сообщение error-маркера (если статус error). */
    errorMessage?: string;
}

/** Итог проверки готовности периода. */
export interface AirtimeReadiness {
    units: AirtimeUnitReadiness[];
    totalMonths: number;
    readyMonths: number;
    allReady: boolean;
    hasError: boolean;
    errorMessage?: string;
    /** Прогресс по месяцам для ответа/WS. */
    months: { month: IsoMonth; status: AirtimeMonthStatus }[];
    /** Оценка остатка сбора (сек) — только когда есть несобранные юниты. */
    etaSeconds?: number;
}

/**
 * Сборка отчёта из ГОТОВЫХ партиций и проверка готовности периода —
 * ни одного похода в Bitrix, только кэш (ячейки + маркеры).
 *
 * Ноль кодируется маркером: ячейки сотрудника нет, но маркер партиции
 * жив → сотрудник в этой партиции не звонил (достоверный ноль). Поэтому
 * смена состава отдела на прогретом периоде собирается мгновенно.
 *
 * forceRefresh инвалидирует ТОЛЬКО span-юниты (хвост текущего/краевого
 * месяца): прошлые месяцы неизменяемы, их пересбор — через cache/reset.
 * Исключение: месяц с error-маркером при forceRefresh уходит в пересбор
 * (это ретрай упавшего, а не пересчёт готового).
 */
@Injectable()
export class AirtimeAssemblyService {
    constructor(
        private readonly cellCache: AirtimeCacheService,
        private readonly markerCache: AirtimeMarkerCacheService,
    ) {}

    /** Готовность всех юнитов периода [fromIso..toIso] (целые дни, включительно). */
    async checkReadiness(
        domain: string,
        fromIso: IsoDate,
        toIso: IsoDate,
        forceRefresh: boolean,
        now: Date = new Date(),
    ): Promise<AirtimeReadiness> {
        const units = buildPartitionUnits(fromIso, toIso, now);
        const months = [...new Set(units.map(unit => unit.month))];
        const [monthMarkers, errorMarkers] = await Promise.all([
            this.markerCache.getMonthMarkers(domain, months),
            this.markerCache.getErrorMarkers(domain, months),
        ]);

        const result: AirtimeUnitReadiness[] = [];
        for (const unit of units) {
            // forceRefresh гасит error-статус: это явный ретрай упавшего —
            // юнит уходит в queued и будет переставлен диспетчером.
            const errorMessage = forceRefresh
                ? undefined
                : errorMarkers.get(unit.month)?.message;

            if (unit.kind === 'month') {
                const marker = monthMarkers.get(unit.month) ?? null;
                if (marker) {
                    result.push({
                        unit,
                        status: 'ready',
                        rowsFetched: marker.rowsFetched,
                        truncated: marker.truncated,
                        todayBlob: null,
                    });
                    continue;
                }
                result.push(this.pendingUnit(unit, errorMessage));
                continue;
            }
            result.push(
                await this.checkSpanUnit(
                    domain,
                    unit,
                    forceRefresh,
                    errorMessage,
                    now,
                ),
            );
        }

        const summary = this.summarize(result);
        const etaSeconds = await this.estimateEta(domain, result);
        return etaSeconds !== undefined ? { ...summary, etaSeconds } : summary;
    }

    /**
     * Сборка отчёта из готовых партиций: Σ ячеек запрошенных сотрудников.
     * Вызывать только при allReady (иначе цифры будут неполными).
     */
    async assemble(
        domain: string,
        readiness: AirtimeReadiness,
        departament: readonly IAirtimeUser[],
        now: Date = new Date(),
    ): Promise<IAirtimeStatisticResult> {
        const userIds = parseDepartamentUserIds(departament);
        const totals = new Map<number, AirtimeMonthCell>(
            userIds.map(id => [id, emptyAirtimeCell()]),
        );

        for (const { unit, todayBlob } of readiness.units) {
            if (unit.kind === 'month') {
                await this.addMonthCells(domain, unit.month, userIds, totals);
            } else {
                await this.addSpanCells(domain, unit, userIds, totals, now);
                this.addTodayBlob(todayBlob, userIds, totals);
            }
        }

        return {
            users: cellsToUserResults(totals, departament),
            rowsFetched: readiness.units.reduce(
                (sum, u) => sum + u.rowsFetched,
                0,
            ),
            truncated: readiness.units.some(u => u.truncated),
        };
    }

    /** Готовность span-юнита: дневные маркеры завершённых дней + today-блоб. */
    private async checkSpanUnit(
        domain: string,
        unit: AirtimeSpanUnit,
        forceRefresh: boolean,
        errorMessage: string | undefined,
        now: Date,
    ): Promise<AirtimeUnitReadiness> {
        // forceRefresh: хвост пересобирается всегда (живые данные).
        if (forceRefresh) return this.pendingUnit(unit, undefined);

        const today = todayIso(now);
        let rowsFetched = 0;
        let truncated = false;

        const completed = spanCompletedRange(unit, today);
        if (completed) {
            const days = enumerateDates(completed.from, completed.to);
            const markers = await this.markerCache.getDayMarkers(domain, days);
            for (const day of days) {
                const marker = markers.get(day);
                if (!marker) return this.pendingUnit(unit, errorMessage);
                rowsFetched += marker.rowsFetched;
                truncated = truncated || marker.truncated;
            }
        }

        let todayBlob: AirtimeTodayBlob | null = null;
        if (unit.includesToday) {
            todayBlob = await this.markerCache.getTodayBlob(domain, today);
            if (!todayBlob) return this.pendingUnit(unit, errorMessage);
            rowsFetched += todayBlob.rowsFetched;
            truncated = truncated || todayBlob.truncated;
        }

        return { unit, status: 'ready', rowsFetched, truncated, todayBlob };
    }

    /** Юнит не готов: error при живом error-маркере, иначе queued. */
    private pendingUnit(
        unit: AirtimePartitionUnit,
        errorMessage: string | undefined,
    ): AirtimeUnitReadiness {
        return {
            unit,
            status: errorMessage ? 'error' : 'queued',
            rowsFetched: 0,
            truncated: false,
            todayBlob: null,
            ...(errorMessage ? { errorMessage } : {}),
        };
    }

    private async addMonthCells(
        domain: string,
        month: IsoMonth,
        userIds: number[],
        totals: Map<number, AirtimeMonthCell>,
    ): Promise<void> {
        const cells = await this.cellCache.getMonthCells(
            domain,
            month,
            userIds,
        );
        for (const [userId, cell] of cells) {
            const acc = totals.get(userId);
            // null при живом маркере = достоверный ноль — не добавляем ничего.
            if (acc && cell) addCellInto(acc, cell);
        }
    }

    private async addSpanCells(
        domain: string,
        unit: AirtimeSpanUnit,
        userIds: number[],
        totals: Map<number, AirtimeMonthCell>,
        now: Date,
    ): Promise<void> {
        const completed = spanCompletedRange(unit, todayIso(now));
        if (!completed) return;
        const days = enumerateDates(completed.from, completed.to);
        const cells = await this.cellCache.getDayCells(domain, days, userIds);
        for (const [pair, cell] of cells) {
            if (!cell) continue;
            const acc = totals.get(Number(pair.split('|')[0]));
            if (acc) addCellInto(acc, cell);
        }
    }

    private addTodayBlob(
        blob: AirtimeTodayBlob | null,
        userIds: number[],
        totals: Map<number, AirtimeMonthCell>,
    ): void {
        if (!blob) return;
        for (const userId of userIds) {
            const cell = blob.cells[String(userId)];
            const acc = totals.get(userId);
            if (acc && cell) addCellInto(acc, cell);
        }
    }

    /**
     * Оценка остатка сбора: Σ по несобранным юнитам скользящего среднего
     * длительности партиций ЭТОГО домена (дефолты — пока замеров нет).
     * Оценка приблизительная: очередь других порталов не учитывается.
     */
    private async estimateEta(
        domain: string,
        units: AirtimeUnitReadiness[],
    ): Promise<number | undefined> {
        const pending = units.filter(u => u.status === 'queued');
        if (!pending.length) return undefined;

        const monthCount = pending.filter(u => u.unit.kind === 'month').length;
        const spanCount = pending.length - monthCount;
        const [monthStats, spanStats] = await Promise.all([
            monthCount
                ? this.markerCache.getDurationStats(domain, 'month')
                : Promise.resolve(null),
            spanCount
                ? this.markerCache.getDurationStats(domain, 'span')
                : Promise.resolve(null),
        ]);

        const monthSec = monthStats
            ? monthStats.avgMs / 1000
            : AIRTIME_ETA_DEFAULT_SECONDS.month;
        const spanSec = spanStats
            ? spanStats.avgMs / 1000
            : AIRTIME_ETA_DEFAULT_SECONDS.span;
        return Math.ceil(monthCount * monthSec + spanCount * spanSec);
    }

    private summarize(units: AirtimeUnitReadiness[]): AirtimeReadiness {
        const byMonth = new Map<IsoMonth, AirtimeMonthStatus>();
        for (const { unit, status } of units) {
            // Юнитов на месяц не больше одного (сегменты дизъюнктны).
            byMonth.set(unit.month, status);
        }
        const months = [...byMonth.entries()].map(([month, status]) => ({
            month,
            status,
        }));
        const readyMonths = months.filter(m => m.status === 'ready').length;
        const firstError = units.find(u => u.status === 'error');

        return {
            units,
            totalMonths: months.length,
            readyMonths,
            allReady: units.every(u => u.status === 'ready'),
            hasError: Boolean(firstError),
            ...(firstError?.errorMessage
                ? { errorMessage: firstError.errorMessage }
                : {}),
            months,
        };
    }
}
