import { Injectable, Logger } from '@nestjs/common';
import {
    CallReportAnalyticsKind,
    CallReportAnalyticsQueryDto,
} from './dto/call-report-analytics-query.dto';
import { CallReportAnalyticsMetaDto } from './dto/call-report-analytics-response.dto';
import {
    AnalyticsDataset,
    CallReportAnalyticsDataService,
} from './services/call-report-analytics-data.service';
import { CallReportAnalyticsAggregatorService } from './services/call-report-analytics-aggregator.service';
import { CallReportAnalyticsCacheService } from './services/call-report-analytics-cache.service';
import { CallReportAnalyticsHistoryService } from './services/call-report-analytics-history.service';

/** Построенный отчёт: meta + тело конкретного вида. */
export type BuiltReport = { meta: CallReportAnalyticsMetaDto } & Record<
    string,
    unknown
>;

/**
 * Фасад модуля отчётов — единственная точка входа для контроллера и
 * программных потребителей (другие app импортируют модуль и вызывают
 * buildReport / resetCache).
 *
 * Конвейер одного запроса:
 * 1) useCache=true → попытка отдать из Redis (fromCache=true);
 * 2) промах/отказ от кэша → выборка сырья → агрегатор (код считает числа);
 * 3) запись в кэш (всегда, даже при useCache=false — обновление);
 * 4) saveToHistory=true → снапшот в ais (id в meta.historyId).
 */
@Injectable()
export class CallReportAnalyticsService {
    private readonly logger = new Logger(CallReportAnalyticsService.name);

    constructor(
        private readonly dataService: CallReportAnalyticsDataService,
        private readonly aggregator: CallReportAnalyticsAggregatorService,
        private readonly cache: CallReportAnalyticsCacheService,
        private readonly history: CallReportAnalyticsHistoryService,
    ) {}

    async buildReport(
        kind: CallReportAnalyticsKind,
        query: CallReportAnalyticsQueryDto,
    ): Promise<BuiltReport> {
        const useCache = query.useCache !== false;
        const cacheKey = this.cache.buildKey(kind, query);
        this.logger.log(
            `Отчёт ${kind}: ${query.domain} ${query.from}..${query.to} ` +
                `(useCache=${useCache}, saveToHistory=${query.saveToHistory === true})`,
        );

        if (useCache) {
            const cached = await this.cache.get<BuiltReport>(cacheKey);
            if (cached) {
                // История пишется и для кэшированного отчёта, если попросили.
                const historyId = await this.maybeSaveHistory(
                    kind,
                    query,
                    cached,
                );
                return {
                    ...cached,
                    meta: { ...cached.meta, fromCache: true, historyId },
                };
            }
        }

        const dataset = await this.dataService.load(query);
        const body = this.aggregate(kind, dataset);
        const report: BuiltReport = {
            meta: this.buildMeta(kind, query, dataset),
            ...body,
        };

        await this.cache.set(cacheKey, report);
        const historyId = await this.maybeSaveHistory(kind, query, report);
        return { ...report, meta: { ...report.meta, historyId } };
    }

    /** Сброс кэша отчётов (см. CallReportAnalyticsCacheService.reset). */
    resetCache(options: {
        report?: CallReportAnalyticsKind;
        domain?: string;
    }): Promise<{ removedKeys: number; pattern: string }> {
        return this.cache.reset(options);
    }

    private aggregate(
        kind: CallReportAnalyticsKind,
        dataset: AnalyticsDataset,
    ): Record<string, unknown> {
        switch (kind) {
            case 'summary':
                return { ...this.aggregator.buildSummary(dataset.rows) };
            case 'speech':
                return { ...this.aggregator.buildSpeech(dataset.rows) };
            case 'objections':
                return { ...this.aggregator.buildObjections(dataset.rows) };
            case 'managers':
                return { ...this.aggregator.buildManagers(dataset.rows) };
        }
    }

    private buildMeta(
        kind: CallReportAnalyticsKind,
        query: CallReportAnalyticsQueryDto,
        dataset: AnalyticsDataset,
    ): CallReportAnalyticsMetaDto {
        return {
            report: kind,
            domain: query.domain,
            from: query.from,
            to: query.to,
            filters: {
                managerId: query.managerId ?? null,
                minDurationSec: query.minDurationSec ?? null,
                maxDurationSec: query.maxDurationSec ?? null,
                callType: query.callType ?? null,
            },
            totalCalls: dataset.totalCalls,
            filteredCalls: dataset.rows.length,
            analyzedCalls: dataset.rows.filter(row => row.analysis !== null)
                .length,
            skippedNoManager: dataset.skippedNoManager,
            fromCache: false,
            generatedAt: new Date().toISOString(),
            historyId: null,
        };
    }

    private async maybeSaveHistory(
        kind: CallReportAnalyticsKind,
        query: CallReportAnalyticsQueryDto,
        report: BuiltReport,
    ): Promise<string | null> {
        if (query.saveToHistory !== true) return null;
        return this.history.save(kind, query, report);
    }
}
