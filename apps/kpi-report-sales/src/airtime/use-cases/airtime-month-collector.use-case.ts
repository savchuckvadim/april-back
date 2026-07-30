import { Logger } from '@nestjs/common';
import { BitrixBaseApi } from '@lib/bitrix';
import {
    firstDayOfNextMonth,
    IsoMonth,
} from '../../shared/lib/month-segments.util';
import { AirtimeCacheService } from '../cache/airtime-cache.service';
import { AirtimeMarkerCacheService } from '../cache/airtime-marker-cache.service';
import { AIRTIME_JOB_MAX_ROWS } from '../constants/airtime-queue.const';
import { aggregateRowsToCellsAllUsers } from '../lib/airtime-cell.util';
import {
    buildAirtimeFilter,
    fetchAirtimeRows,
} from '../lib/voximplant-fetch.util';

/**
 * Сбор МЕСЯЧНОЙ партиции эфирного времени по ВСЕМУ порталу (без фильтра
 * по сотрудникам): партиция не зависит от состава отдела — смена фильтра
 * сотрудников на прогретом периоде не ходит в Bitrix вообще.
 *
 * Порядок записи строго «ячейки → маркер»: ячейки без маркера = честный
 * промах (пересбор), маркер без ячеек дал бы тихие нули. Нулевые ячейки
 * не пишутся — ноль кодируется самим маркером.
 *
 * НЕ Injectable: создаётся `new AirtimeMonthCollectorUseCase(bitrix.api, ...)`
 * per-job под конкретный домен (правило CLAUDE.md про PBXService).
 */
export class AirtimeMonthCollectorUseCase {
    private readonly logger = new Logger(AirtimeMonthCollectorUseCase.name);

    constructor(
        private readonly bitrixApi: BitrixBaseApi,
        private readonly cellCache: AirtimeCacheService,
        private readonly markerCache: AirtimeMarkerCacheService,
        private readonly domain: string,
    ) {}

    /** Собирает месяц, пишет ячейки и ready-маркер. Дроп страницы → throw. */
    async collect(
        month: IsoMonth,
    ): Promise<{ rowsFetched: number; truncated: boolean }> {
        const { rows, truncated } = await fetchAirtimeRows(
            this.bitrixApi,
            buildAirtimeFilter(
                undefined,
                `${month}-01`,
                firstDayOfNextMonth(month),
            ),
            AIRTIME_JOB_MAX_ROWS,
            this.logger,
        );

        const cells = aggregateRowsToCellsAllUsers(rows);
        await this.cellCache.setMonthCells(this.domain, month, cells);
        await this.markerCache.setMonthMarker(this.domain, month, {
            truncated,
            rowsFetched: rows.length,
            completedAt: new Date().toISOString(),
        });
        await this.markerCache.clearErrorMarker(this.domain, month);

        if (truncated) {
            this.logger.error(
                `[${this.domain}] месяц ${month} обрезан по лимиту ` +
                    `${AIRTIME_JOB_MAX_ROWS} строк — партиция помечена ` +
                    'truncated и живёт короткий TTL',
            );
        }
        return { rowsFetched: rows.length, truncated };
    }
}
