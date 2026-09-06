import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { buildReportUsersKey } from '../../../report';
import { normalizeReportPeriod } from '../../../shared/lib/date-util';
import {
    MonthSegment,
    splitIntoMonthSegments,
} from '../../../shared/lib/month-segments.util';
import { KpiMonthCalculator } from './kpi-month.calculator';
import type {
    AiKpiLoadOptions,
    AiKpiMonth,
    AiKpiMonthsResult,
} from './kpi.types';
import {
    buildKpiMonthKey,
    monthSegmentTtlSeconds,
} from './loader-cache-key.util';
import { ManagersLoader } from './managers.loader';

/**
 * Загрузчик KPI-слоя (план, Фаза 1b п. 1): период режется на календарные
 * месяцы (splitIntoMonthSegments), закрытые полные месяцы берутся из кэша
 * `kpi-month` (30 дней) без обращения к Bitrix, живой/неполный сегмент
 * считается заново и буферизуется на 180 с. forceRefresh обходит чтение,
 * запись — всегда (write-through). Расчёт сегмента — KpiMonthCalculator
 * (kpi-report + per-type батч), создаётся лениво один раз на вызов.
 *
 * @Injectable без bitrix-состояния: PBXService, кэш и ростер.
 */
@Injectable()
export class KpiLoader {
    private readonly logger = new Logger(KpiLoader.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly cache: AiAnalyticsCacheService,
        private readonly managers: ManagersLoader,
    ) {}

    async loadKpiMonths(
        domain: string,
        from: string,
        to: string,
        managerIds?: readonly (string | number)[],
        options: AiKpiLoadOptions = {},
    ): Promise<AiKpiMonthsResult> {
        const period = normalizeReportPeriod(from, to);
        const ids = await this.managers.resolve(domain, managerIds);
        const usersKey = buildReportUsersKey(ids);
        const segments = splitIntoMonthSegments(
            period.fromIso,
            period.toIsoInclusive,
            options.now ?? new Date(),
        );

        let calculator: KpiMonthCalculator | null = null;
        const months: AiKpiMonth[] = [];
        for (const segment of segments) {
            const key = buildKpiMonthKey(domain, segment, usersKey);
            const cached = options.forceRefresh
                ? null
                : await this.cache.getJson<AiKpiMonth>(key);
            if (cached) {
                months.push({ ...cached, fromCache: true });
                continue;
            }
            calculator ??= await KpiMonthCalculator.create(
                domain,
                this.pbx,
                ids,
            );
            const computed = await calculator.compute(segment);
            await this.store(key, segment, computed);
            months.push(computed);
        }

        return {
            from: period.fromIso,
            to: period.toIsoInclusive,
            managerIds: ids,
            months,
        };
    }

    /** Write-through; ошибка кэша не роняет ответ — значение уже посчитано. */
    private async store(
        key: string,
        segment: MonthSegment,
        month: AiKpiMonth,
    ): Promise<void> {
        try {
            await this.cache.setJson(
                key,
                month,
                monthSegmentTtlSeconds(segment),
            );
        } catch (error) {
            this.logger.warn(
                `Кэш ${key} не записан: ${(error as Error).message}`,
            );
        }
    }
}
