import { Injectable, Logger } from '@nestjs/common';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { buildReportUsersKey } from '../../../report';
import { SalesHotThreshold } from '../../../sales-finance';
import { normalizeReportPeriod } from '../../../shared/lib/date-util';
import {
    MonthSegment,
    splitIntoMonthSegments,
} from '../../../shared/lib/month-segments.util';
import {
    summarizeManagers,
    toFinanceMonth,
    toPipelineByManager,
} from './finance.assembler';
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

/** Пайплайн — от презентации и выше; «горячие» — от документов (ТЗ FR-40, план §2.2). */
const DEFAULT_PIPELINE_THRESHOLD: SalesHotThreshold = 'presentation';
const DEFAULT_HOT_THRESHOLD: SalesHotThreshold = 'document';

/**
 * Загрузчик финансового хвоста (план, Фаза 1b п. 3): закрытые продажи —
 * по месячным сегментам через ClosedSalesUseCase (закрытые месяцы из кэша
 * `finance-month` 30 дней, живой сегмент 180 с; внутри use-case свой
 * месячный кэш sales-finance — общий с вкладкой «Финансы»); пайплайн —
 * один вызов HotClientsUseCase по порогу пайплайна, «горячие» выделяются
 * по порядку стадии (кэш `finance-pipeline` 180 с).
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
        const hotThreshold = options.hotThreshold ?? DEFAULT_HOT_THRESHOLD;
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
            hotThreshold,
            options,
        );

        return {
            from: period.fromIso,
            to: period.toIsoInclusive,
            managerIds: ids,
            pipelineThreshold,
            hotThreshold,
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
        hotThreshold: SalesHotThreshold,
        options: AiFinanceLoadOptions,
    ): Promise<AiFinancePipelineResult> {
        const key = buildFinancePipelineKey(
            domain,
            `${pipelineThreshold}-${hotThreshold}`,
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
                hotThreshold,
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
