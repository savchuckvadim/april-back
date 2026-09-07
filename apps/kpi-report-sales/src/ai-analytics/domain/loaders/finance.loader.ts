import { Injectable, Logger } from '@nestjs/common';
import type { PbxDealSalesBaseStageCode } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { AI_ANALYTICS_HOT_STAGE_CODE } from '../../constants/ai-overview.const';
import { buildReportUsersKey } from '../../../report';
import { SalesHotThreshold } from '../../../sales-finance';
import { normalizeReportPeriod } from '../../../shared/lib/date-util';
import {
    MonthSegment,
    splitIntoMonthSegments,
} from '../../../shared/lib/month-segments.util';
import { summarizeManagers, toFinanceMonth } from './finance.assembler';
import { toPipelineByManager } from './finance-pipeline.assembler';
import type {
    AiFinanceLoadOptions,
    AiFinanceMonth,
    AiFinancePipelineResult,
    AiFinanceResult,
} from './finance.types';
import {
    AI_ANALYTICS_LIVE_TTL_SECONDS,
    buildFinanceMonthKey,
    buildFinancePipelineKey,
    monthSegmentTtlSeconds,
} from './loader-cache-key.util';
import { ManagersLoader } from './managers.loader';
import {
    SalesFinanceUseCaseFactory,
    SalesFinanceUseCases,
} from './sales-finance-use-case.factory';

/**
 * Пайплайн — от презентации и выше (ТЗ FR-40, план §2.2; самый широкий
 * порог, ключ кэша sales-finance уже прогрет вкладкой «Финансы»).
 * «Горячие» режутся в памяти по AI_ANALYTICS_HOT_STAGE_CODE.
 */
const DEFAULT_PIPELINE_THRESHOLD: SalesHotThreshold = 'presentation';

/**
 * Загрузчик финансового хвоста (план, Фаза 1b п. 3): закрытые продажи —
 * по месячным сегментам через ClosedSalesUseCase (закрытые месяцы из кэша
 * `finance-month` 30 дней, живой сегмент 180 с; внутри use-case свой
 * месячный кэш sales-finance — общий с вкладкой «Финансы»); пайплайн —
 * один вызов HotClientsUseCase по порогу пайплайна, «горячие» (стадия ≥
 * «В решении») и разрезы v2 выделяются по порядку стадии в памяти
 * (кэш `finance-pipeline` 180 с).
 *
 * @Injectable без bitrix-состояния: фабрика use-case'ов, кэш, ростер.
 */
@Injectable()
export class FinanceLoader {
    private readonly logger = new Logger(FinanceLoader.name);

    constructor(
        private readonly useCases: SalesFinanceUseCaseFactory,
        private readonly cache: AiAnalyticsCacheService,
        private readonly managers: ManagersLoader,
    ) {}

    async loadFinance(
        domain: string,
        from: string,
        to: string,
        managerIds?: readonly (string | number)[],
        options: AiFinanceLoadOptions = {},
    ): Promise<AiFinanceResult> {
        const period = normalizeReportPeriod(from, to);
        const ids = await this.managers.resolve(domain, managerIds);
        const usersKey = buildReportUsersKey(ids);
        const pipelineThreshold =
            options.pipelineThreshold ?? DEFAULT_PIPELINE_THRESHOLD;
        const hotStageCode =
            options.hotStageCode ?? AI_ANALYTICS_HOT_STAGE_CODE;
        const segments = splitIntoMonthSegments(
            period.fromIso,
            period.toIsoInclusive,
            options.now ?? new Date(),
        );
        const useCases = this.useCases.create();

        const months: AiFinanceMonth[] = [];
        for (const segment of segments) {
            months.push(
                await this.loadMonth(
                    domain,
                    segment,
                    ids,
                    usersKey,
                    useCases,
                    options,
                ),
            );
        }
        const pipeline = await this.loadPipeline(
            domain,
            ids,
            usersKey,
            useCases,
            pipelineThreshold,
            hotStageCode,
            options,
        );

        return {
            from: period.fromIso,
            to: period.toIsoInclusive,
            managerIds: ids,
            pipelineThreshold,
            hotStageCode,
            months,
            pipeline,
            managers: summarizeManagers(months, pipeline.managers, ids),
        };
    }

    private async loadMonth(
        domain: string,
        segment: MonthSegment,
        ids: number[],
        usersKey: string,
        useCases: SalesFinanceUseCases,
        options: AiFinanceLoadOptions,
    ): Promise<AiFinanceMonth> {
        const key = buildFinanceMonthKey(domain, segment, usersKey);
        const cached = options.forceRefresh
            ? null
            : await this.cache.getJson<AiFinanceMonth>(key);
        if (cached) return { ...cached, fromCache: true };

        const report = ids.length
            ? await useCases.closed.execute({
                  domain,
                  forceRefresh: options.forceRefresh === true,
                  filters: {
                      assignedIds: ids,
                      dateFrom: segment.from,
                      dateTo: segment.to,
                  },
              })
            : null;
        const month = toFinanceMonth(
            segment,
            report ?? {
                employees: [],
                totals: {
                    dealsCount: 0,
                    advanceAmount: 0,
                    paidMonths: 0,
                    monthlyAmount: 0,
                    quantity: 0,
                    expectedContractAmount: 0,
                },
                dateFrom: segment.from,
                dateTo: segment.to,
                generatedAt: new Date().toISOString(),
            },
            ids,
        );
        await this.store(key, month, monthSegmentTtlSeconds(segment));
        return month;
    }

    private async loadPipeline(
        domain: string,
        ids: number[],
        usersKey: string,
        useCases: SalesFinanceUseCases,
        pipelineThreshold: SalesHotThreshold,
        hotStageCode: PbxDealSalesBaseStageCode,
        options: AiFinanceLoadOptions,
    ): Promise<AiFinancePipelineResult> {
        const key = buildFinancePipelineKey(
            domain,
            `${pipelineThreshold}-${hotStageCode}`,
            usersKey,
        );
        const cached = options.forceRefresh
            ? null
            : await this.cache.getJson<AiFinancePipelineResult>(key);
        if (cached) return { ...cached, fromCache: true };

        const report = ids.length
            ? await useCases.hot.execute({
                  domain,
                  threshold: pipelineThreshold,
                  assignedIds: ids,
                  forceRefresh: options.forceRefresh === true,
              })
            : null;
        const result: AiFinancePipelineResult = {
            fromCache: false,
            managers: toPipelineByManager(
                report?.deals ?? [],
                ids,
                hotStageCode,
            ),
        };
        await this.store(key, result, AI_ANALYTICS_LIVE_TTL_SECONDS);
        return result;
    }

    /** Write-through; ошибка кэша не роняет ответ — значение уже посчитано. */
    private async store<T>(
        key: string,
        value: T,
        ttlSeconds: number,
    ): Promise<void> {
        try {
            await this.cache.setJson(key, value, ttlSeconds);
        } catch (error) {
            this.logger.warn(
                `Кэш ${key} не записан: ${(error as Error).message}`,
            );
        }
    }
}
