import { GetCallingStatisticDto } from '../dto/calling-statistic.dto';
import {
    CALLING_TYPES,
    CallingDuration,
    ICallingStatisticResult,
    VoximplantFilter,
} from '../types/calling-statistic.type';
import { IBXUser } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { BitrixBaseApi } from '@/modules/bitrix';
import {
    assertBatchComplete,
    mergeBatchResults,
    MergedBatchResults,
} from '../../shared/lib/batch-completeness.util';
import {
    normalizeReportPeriod,
    NormalizedReportPeriod,
} from '../../shared/lib/date-util';
import { toIsoDateOf } from '../../shared/lib/month-segments.util';
import { ReportResultCacheService } from '../cache/report-result-cache.service';
import {
    buildCallingStatResultKey,
    buildReportUsersKey,
} from '../cache/report-cache-key.util';
import {
    CALLING_STAT_CACHE_APP,
    KPI_RESULT_TTL_LIVE_SECONDS,
    KPI_RESULT_TTL_PAST_SECONDS,
} from '../constants/report-queue.const';

const VOXIMPLANT_METHOD = 'voximplant.statistic.get';

/**
 * Счётная статистика звонков: 6 бакетов длительности × N сотрудников
 * одним батчем result_total (строки не выгружаются).
 *
 * Громкие ошибки вместо тихо неполных счётчиков (инцидент 2026-07-28,
 * «наборы» 1000+ → 72 → 9 при истинных 88): strict-батч роняет упавший
 * чанк, assertBatchComplete — пропавшую команду; у каждого сотрудника
 * ровно 6 бакетов (кардинальность фиксирована).
 *
 * Даты нормализуются к ISO (normalizeReportPeriod): легаси DD.MM.YYYY
 * старого фронта и каноничный YYYY-MM-DD дают одинаковые границы фильтра
 * и один ключ кэша.
 *
 * НЕ Injectable: `new CallingStatisticUseCase(bitrix.api, cache?)` per-domain
 * (правило CLAUDE.md). cache опционален — write-through конверта результата.
 */
export class CallingStatisticUseCase {
    constructor(
        private readonly bitrixApi: BitrixBaseApi,
        private readonly cache?: ReportResultCacheService,
    ) {}

    async get(dto: GetCallingStatisticDto): Promise<ICallingStatisticResult[]> {
        const departament = dto.filters.departament;
        const period = normalizeReportPeriod(
            dto.filters.dateFrom,
            dto.filters.dateTo,
        );

        const expectedKeys: string[] = [];
        for (const user of departament) {
            const userId = user.ID;
            if (!userId) continue;
            for (const type of CALLING_TYPES) {
                const key = `${VOXIMPLANT_METHOD}_${type.id}_${userId}`;
                this.bitrixApi.addCmdBatch(key, VOXIMPLANT_METHOD, {
                    // Легаси-запрос шлёт в фильтр исходные строки (как прод),
                    // канон — ISO; см. NormalizedReportPeriod.bitrixFrom.
                    FILTER: this.buildVoximplantFilter(
                        userId,
                        period.bitrixFrom,
                        period.bitrixTo,
                        type.id,
                    ),
                });
                expectedKeys.push(key);
            }
        }

        const response = await this.bitrixApi.callBatchWithConcurrency(2, {
            strict: true,
        });
        const merged = mergeBatchResults(response);
        assertBatchComplete(merged, expectedKeys, 'статистика звонков');

        const result = this.getFormedResults(merged, departament);
        await this.writeCache(dto.domain, period, departament, result);
        return result;
    }

    private buildVoximplantFilter = (
        userId: number | string,
        fromInclusive: string,
        toExclusive: string,
        duration: CallingDuration,
    ): VoximplantFilter => {
        const filter: VoximplantFilter = {
            PORTAL_USER_ID: userId,
            '>CALL_START_DATE': fromInclusive,
            '<CALL_START_DATE': toExclusive,
        };
        if (duration !== 'all') {
            filter['>CALL_DURATION'] = duration;
        }
        return filter;
    };

    /**
     * У каждого сотрудника с ID — ровно 6 бакетов (счётчик из result_total,
     * полнота гарантирована assertBatchComplete). Сотрудник без ID —
     * пустой список (команд по нему не было), как и раньше.
     */
    private getFormedResults = (
        merged: MergedBatchResults,
        departament: IBXUser[],
    ): ICallingStatisticResult[] =>
        departament.map(user => ({
            user,
            userName: user.NAME ?? '',
            callings: user.ID
                ? CALLING_TYPES.map(type => ({
                      id: type.id,
                      action: type.action,
                      count:
                          Number(
                              merged.totals[
                                  `${VOXIMPLANT_METHOD}_${type.id}_${user.ID}`
                              ],
                          ) || 0,
                      duration: 0,
                  }))
                : [],
        }));

    /** Write-through конверта результата (воркер, легаси-sync, снапшот). */
    private async writeCache(
        domain: string,
        period: NormalizedReportPeriod,
        departament: IBXUser[],
        result: ICallingStatisticResult[],
    ): Promise<void> {
        if (!this.cache) return;
        const usersKey = buildReportUsersKey(departament.map(user => user.ID));
        const isPastPeriod = period.toIsoInclusive < toIsoDateOf(new Date());
        await this.cache.setReady(
            CALLING_STAT_CACHE_APP,
            domain,
            buildCallingStatResultKey(
                period.fromIso,
                period.toIsoInclusive,
                usersKey,
            ),
            result,
            isPastPeriod
                ? KPI_RESULT_TTL_PAST_SECONDS
                : KPI_RESULT_TTL_LIVE_SECONDS,
        );
    }
}
