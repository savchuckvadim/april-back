import { Logger } from '@nestjs/common';
import { BitrixBaseApi } from '@lib/bitrix';
import {
    firstDayOfNextMonth,
    IsoDate,
    MonthSegment,
    splitIntoMonthSegments,
} from '../../shared/lib/month-segments.util';
import { GetAirtimeStatisticDto } from '../dto/airtime-statistic.dto';
import { AirtimeCacheService } from '../cache/airtime-cache.service';
import {
    AirtimeMonthCell,
    IAirtimeStatisticResult,
    VoximplantAirtimeFilter,
    VoximplantAirtimeRow,
    VoximplantStatisticEnvelope,
} from '../types/airtime-statistic.type';
import {
    aggregateRowsToCells,
    cellsToUserResults,
    mergeCellsInto,
} from '../lib/airtime-cell.util';

const VOXIMPLANT_STATISTIC_METHOD = 'voximplant.statistic.get';
const DEFAULT_MAX_ROWS = 10_000;

/**
 * Эфирное время менеджеров: сумма CALL_DURATION по каждому сотруднику
 * за период через voximplant.statistic.get.
 *
 * Месячное партиционирование с кэшем (прецедент — sales-finance):
 * период режется на календарные месяцы; ПРОШЛЫЕ ПОЛНЫЕ месяцы берутся
 * из AirtimeCacheService (ячейки «сотрудник × месяц», Redis + MySQL) и
 * не пересчитываются, промахи добираются ОДНОЙ voximplant-выборкой
 * месяца по недостающим сотрудникам; текущий месяц и неполные краевые
 * сегменты всегда считаются живьём и НЕ кэшируются («сегодня данные
 * меняются»). Бонус: месячная выборка почти не упирается в лимит строк,
 * в отличие от годовой (truncated лечится сам).
 *
 * Нюанс границ дат: фильтры строгие (`>CALL_START_DATE`, `<`). Ячейка
 * полного месяца считается в границах `> 'yyyy-MM-01'` и `< первый день
 * следующего месяца`; краевые сегменты используют исходные dateFrom/dateTo.
 * Суммарно семантика идентична прежней единой выборке — теряются только
 * звонки ровно в полночь границы месяца (терялись и раньше на dateFrom).
 *
 * НЕ Injectable: создаётся `new AirtimeStatisticUseCase(bitrix.api, cache,
 * domain)` под конкретный домен (правило CLAUDE.md про PBXService).
 */
export class AirtimeStatisticUseCase {
    private readonly logger = new Logger(AirtimeStatisticUseCase.name);

    constructor(
        private readonly bitrixApi: BitrixBaseApi,
        private readonly cache: AirtimeCacheService,
        private readonly domain: string,
    ) {}

    async get(dto: GetAirtimeStatisticDto): Promise<IAirtimeStatisticResult> {
        const { departament, dateFrom, dateTo, maxRows } = dto.filters;
        const userIds = departament
            .map(user => Number(String(user.ID ?? '').trim()))
            .filter(id => Number.isFinite(id) && id > 0);

        if (!userIds.length) {
            return { users: [], rowsFetched: 0, truncated: false };
        }

        const rawFrom = String(dateFrom);
        const rawTo = String(dateTo);
        const rowBudget = maxRows ?? DEFAULT_MAX_ROWS;
        // Дата с временем (ISO с 'T…') на краю периода — краевой сегмент
        // не кэшируем: ячейка канонична по границам месяца и не умеет
        // учитывать срез по часам.
        const hasTimePart = (value: string) => value.length > 10;

        const segments = splitIntoMonthSegments(
            rawFrom.slice(0, 10) as IsoDate,
            rawTo.slice(0, 10) as IsoDate,
            new Date(),
        );

        const totals = new Map<number, AirtimeMonthCell>();
        let rowsFetched = 0;
        let truncated = false;

        for (const [index, segment] of segments.entries()) {
            const isFirst = index === 0;
            const isLast = index === segments.length - 1;
            const cacheable =
                segment.cacheable &&
                !(isFirst && hasTimePart(rawFrom)) &&
                !(isLast && hasTimePart(rawTo));

            const loaded = cacheable
                ? await this.loadCacheableMonth(segment, userIds, rowBudget)
                : await this.loadLiveSegment(
                      userIds,
                      // Краевые сегменты сохраняют исходные (строгие) границы
                      // запроса — семантика 1:1 с прежней единой выборкой.
                      isFirst ? rawFrom : segment.from,
                      isLast ? rawTo : firstDayOfNextMonth(segment.month),
                      rowBudget,
                  );

            mergeCellsInto(totals, loaded.cells);
            rowsFetched += loaded.rowsFetched;
            truncated = truncated || loaded.truncated;
        }

        return {
            users: cellsToUserResults(totals, departament),
            rowsFetched,
            truncated,
        };
    }

    /**
     * Полный прошлый месяц: ячейки из кэша; промахнувшимся сотрудникам —
     * одна живая выборка месяца, результат (включая нулевые ячейки!)
     * пишется в кэш. Обрезанный по лимиту месяц НЕ кэшируется.
     */
    private async loadCacheableMonth(
        segment: MonthSegment,
        userIds: number[],
        maxRows: number,
    ): Promise<SegmentLoad> {
        const cached = await this.cache.getMonthCells(
            this.domain,
            segment.month,
            userIds,
        );

        const cells = new Map<number, AirtimeMonthCell>();
        const missing: number[] = [];
        for (const [userId, cell] of cached) {
            if (cell) cells.set(userId, cell);
            else missing.push(userId);
        }
        if (!missing.length) {
            return { cells, rowsFetched: 0, truncated: false };
        }

        const { rows, truncated } = await this.fetchRows(
            this.buildFilter(
                missing,
                segment.from,
                firstDayOfNextMonth(segment.month),
            ),
            maxRows,
        );
        const fresh = aggregateRowsToCells(rows, missing);
        if (!truncated) {
            await this.cache.setMonthCells(this.domain, segment.month, fresh);
        }

        mergeCellsInto(cells, fresh);
        return { cells, rowsFetched: rows.length, truncated };
    }

    /** Текущий месяц / неполный краевой сегмент — всегда живьём, без кэша. */
    private async loadLiveSegment(
        userIds: number[],
        fromExclusive: string,
        toExclusive: string,
        maxRows: number,
    ): Promise<SegmentLoad> {
        const { rows, truncated } = await this.fetchRows(
            this.buildFilter(userIds, fromExclusive, toExclusive),
            maxRows,
        );
        return {
            cells: aggregateRowsToCells(rows, userIds),
            rowsFetched: rows.length,
            truncated,
        };
    }

    private buildFilter(
        userIds: readonly number[],
        fromExclusive: string,
        toExclusive: string,
    ): VoximplantAirtimeFilter {
        return {
            PORTAL_USER_ID: userIds.map(String),
            '>CALL_START_DATE': fromExclusive,
            '<CALL_START_DATE': toExclusive,
            '>CALL_DURATION': 0,
        };
    }

    /** Пагинированная выгрузка строк статистики (Битрикс отдаёт по 50 строк). */
    private async fetchRows(
        filter: VoximplantAirtimeFilter,
        maxRows: number,
    ): Promise<{ rows: VoximplantAirtimeRow[]; truncated: boolean }> {
        const rows: VoximplantAirtimeRow[] = [];
        let start = 0;
        let complete = false;

        while (!complete && rows.length < maxRows) {
            const response = (await this.bitrixApi.call(
                VOXIMPLANT_STATISTIC_METHOD,
                {
                    FILTER: filter,
                    SORT: 'CALL_START_DATE',
                    ORDER: 'ASC',
                    start,
                },
            )) as VoximplantStatisticEnvelope;

            const page = response.result ?? [];
            rows.push(...page);

            if (!page.length || response.next === undefined) {
                complete = true;
            } else {
                start = response.next;
            }
        }

        this.logger.log(
            `${VOXIMPLANT_STATISTIC_METHOD}: собрано ${rows.length} строк` +
                (complete ? '' : ` — обрезано по лимиту ${maxRows}`),
        );
        return { rows, truncated: !complete };
    }
}

/** Итог загрузки одного месячного сегмента. */
interface SegmentLoad {
    cells: Map<number, AirtimeMonthCell>;
    rowsFetched: number;
    truncated: boolean;
}
