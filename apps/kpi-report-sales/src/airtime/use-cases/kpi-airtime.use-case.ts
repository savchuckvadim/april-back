import { Logger } from '@nestjs/common';
import { BitrixBaseApi } from '@lib/bitrix';
import {
    enumerateDates,
    firstDayOfNextMonth,
    IsoDate,
    MonthSegment,
    monthOf,
    nextDay,
    prevDay,
    splitIntoMonthSegments,
    toIsoDateOf,
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
    addCellInto,
    aggregateRowsToCells,
    aggregateRowsToDayCells,
    cellsToUserResults,
    emptyAirtimeCell,
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

        const now = new Date();
        const today = toIsoDateOf(now);
        const currentMonth = monthOf(now);
        const segments = splitIntoMonthSegments(
            rawFrom.slice(0, 10) as IsoDate,
            rawTo.slice(0, 10) as IsoDate,
            now,
        );

        const totals = new Map<number, AirtimeMonthCell>();
        let rowsFetched = 0;
        let truncated = false;

        for (const [index, segment] of segments.entries()) {
            const isFirst = index === 0;
            const isLast = index === segments.length - 1;
            const timeEdge =
                (isFirst && hasTimePart(rawFrom)) ||
                (isLast && hasTimePart(rawTo));

            let loaded: SegmentLoad;
            if (segment.cacheable && !timeEdge) {
                // Полный прошлый месяц — месячная ячейка.
                loaded = await this.loadCacheableMonth(
                    segment,
                    userIds,
                    rowBudget,
                );
            } else if (segment.month === currentMonth && !timeEdge) {
                // Текущий месяц — прошедшие дни поднёвно из кэша, сегодня живьём.
                loaded = await this.loadCurrentMonthDays(
                    segment.from,
                    segment.to,
                    userIds,
                    today,
                    rowBudget,
                );
            } else {
                // Неполный краевой сегмент / дата с временем — живьём без кэша.
                loaded = await this.loadLiveSegment(
                    userIds,
                    isFirst ? rawFrom : segment.from,
                    isLast ? rawTo : firstDayOfNextMonth(segment.month),
                    rowBudget,
                );
            }

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

    /**
     * Текущий месяц: прошедшие дни — поднёвные ячейки из кэша (недостающие
     * добираются ОДНОЙ выборкой span'а промахов и кэшируются, включая нули);
     * СЕГОДНЯ — живой запрос без кэша («сегодня данные ещё меняются»).
     */
    private async loadCurrentMonthDays(
        segFrom: IsoDate,
        segTo: IsoDate,
        userIds: number[],
        today: IsoDate,
        maxRows: number,
    ): Promise<SegmentLoad> {
        const cells = new Map<number, AirtimeMonthCell>(
            userIds.map(id => [id, emptyAirtimeCell()]),
        );
        let rowsFetched = 0;
        let truncated = false;

        // Прошедшие дни: [segFrom .. min(segTo, вчера)]
        const yesterday = prevDay(today);
        const completedEnd = segTo < yesterday ? segTo : yesterday;
        if (segFrom <= completedEnd) {
            const days = enumerateDates(segFrom, completedEnd);
            const cached = await this.cache.getDayCells(
                this.domain,
                days,
                userIds,
            );

            const missingDates = new Set<string>();
            const missingUsers = new Set<number>();
            for (const [pair, cell] of cached) {
                if (!cell) {
                    const [u, d] = pair.split('|');
                    missingDates.add(d!);
                    missingUsers.add(Number(u));
                }
            }

            if (missingDates.size) {
                const sorted = [...missingDates].sort();
                const fetchFrom = sorted[0] as IsoDate;
                const fetchTo = sorted[sorted.length - 1] as IsoDate;
                const usersArr = [...missingUsers];
                const { rows, truncated: tr } = await this.fetchRows(
                    this.buildFilter(usersArr, fetchFrom, nextDay(fetchTo)),
                    maxRows,
                );
                rowsFetched += rows.length;
                truncated = truncated || tr;

                const fresh = aggregateRowsToDayCells(
                    rows,
                    usersArr,
                    enumerateDates(fetchFrom, fetchTo),
                );
                if (!tr) {
                    await this.cache.setDayCells(this.domain, fresh);
                }
                for (const [pair, cell] of fresh) cached.set(pair, cell);
            }

            for (const [pair, cell] of cached) {
                if (!cell) continue;
                const acc = cells.get(Number(pair.split('|')[0]!));
                if (acc) addCellInto(acc, cell);
            }
        }

        // Сегодня (если период его включает) — живьём.
        if (segTo >= today) {
            const todayFrom = segFrom > today ? segFrom : today;
            const { rows, truncated: tr } = await this.fetchRows(
                this.buildFilter(userIds, todayFrom, nextDay(segTo)),
                maxRows,
            );
            rowsFetched += rows.length;
            truncated = truncated || tr;
            mergeCellsInto(cells, aggregateRowsToCells(rows, userIds));
        }

        return { cells, rowsFetched, truncated };
    }

    /** Неполный краевой сегмент / дата с временем — всегда живьём, без кэша. */
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
