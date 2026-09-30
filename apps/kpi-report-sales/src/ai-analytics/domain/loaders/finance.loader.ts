import { Injectable, Logger } from '@nestjs/common';
import type { PbxDealSalesBaseStageCode } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { AI_ANALYTICS_HOT_STAGE_CODE } from '../../constants/ai-overview.const';
import { buildReportUsersKey } from '../../../report';
import type {
    ClosedSalesExecution,
    SalesHotThreshold,
} from '../../../sales-finance';
import {
    normalizeReportPeriod,
    type NormalizedReportPeriod,
} from '../../../shared/lib/date-util';
import { splitIntoMonthSegments } from '../../../shared/lib/month-segments.util';
import {
    splitClosedSalesByMonth,
    summarizeManagers,
} from './finance.assembler';
import { toPipelineByManager } from './finance-pipeline.assembler';
import type {
    AiFinanceLoadOptions,
    AiFinancePipelineResult,
    AiFinanceResult,
    AiFinanceSource,
} from './finance.types';
import {
    AI_ANALYTICS_LIVE_TTL_SECONDS,
    buildFinancePipelineKey,
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
 * Загрузчик финансового хвоста (план, Фаза 1b п. 3). Закрытые продажи —
 * ОДНИМ вызовом ClosedSalesUseCase за весь период обзора, как вкладка
 * «Финансы»: те же даты, та же формула, итоги сотрудника берутся как есть.
 * Своего кэша у закрытых продаж нет — единственный источник кэша
 * sales-finance (общий на домен закрытый месяц), поэтому «Пересчитать» и
 * сброс вкладки «Финансы» действуют и здесь. Помесячная разбивка для
 * ночного шага строится по дате закрытия сделок (finance.assembler).
 * Пайплайн — один вызов HotClientsUseCase по порогу пайплайна, «горячие»
 * (стадия ≥ «В решении») и разрезы v2 выделяются по порядку стадии в
 * памяти (кэш `finance-pipeline` 180 с).
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
        const pipelineThreshold =
            options.pipelineThreshold ?? DEFAULT_PIPELINE_THRESHOLD;
        const hotStageCode =
            options.hotStageCode ?? AI_ANALYTICS_HOT_STAGE_CODE;
        const now = options.now ?? new Date();
        const useCases = this.useCases.create();

        const closed = await this.loadClosed(
            domain,
            period,
            ids,
            useCases,
            options,
        );
        const pipeline = await this.loadPipeline(
            domain,
            ids,
            useCases,
            pipelineThreshold,
            hotStageCode,
            options,
        );
        const source: AiFinanceSource = {
            from: period.fromIso,
            to: period.toIsoInclusive,
            generatedAt: closed?.report.generatedAt ?? now.toISOString(),
        };
        const employees = closed?.report.employees ?? [];

        return {
            from: period.fromIso,
            to: period.toIsoInclusive,
            managerIds: ids,
            pipelineThreshold,
            hotStageCode,
            months: splitClosedSalesByMonth(
                splitIntoMonthSegments(
                    period.fromIso,
                    period.toIsoInclusive,
                    now,
                ),
                employees,
                ids,
                new Set(closed?.cachedMonths ?? []),
            ),
            pipeline,
            managers: summarizeManagers(
                employees,
                pipeline.managers,
                ids,
                source,
            ),
        };
    }

    /**
     * Закрытые продажи периода одним вызовом (даты — как у «Финансов»:
     * начало и конец периода включительно). Пустой ростер — без вызова.
     */
    private async loadClosed(
        domain: string,
        period: NormalizedReportPeriod,
        ids: number[],
        useCases: SalesFinanceUseCases,
        options: AiFinanceLoadOptions,
    ): Promise<ClosedSalesExecution | null> {
        if (!ids.length) return null;
        return useCases.closed.executeDetailed({
            domain,
            forceRefresh: options.forceRefresh === true,
            filters: {
                assignedIds: ids,
                dateFrom: period.fromIso,
                dateTo: period.toIsoInclusive,
            },
        });
    }

    private async loadPipeline(
        domain: string,
        ids: number[],
        useCases: SalesFinanceUseCases,
        pipelineThreshold: SalesHotThreshold,
        hotStageCode: PbxDealSalesBaseStageCode,
        options: AiFinanceLoadOptions,
    ): Promise<AiFinancePipelineResult> {
        const key = buildFinancePipelineKey(
            domain,
            `${pipelineThreshold}-${hotStageCode}`,
            buildReportUsersKey(ids),
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
