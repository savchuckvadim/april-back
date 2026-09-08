import { Injectable } from '@nestjs/common';
import {
    InjectMetric,
    makeCounterProvider,
    makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';
import {
    AI_PIPELINE_DURATION_BUCKETS,
    AI_PIPELINE_METRIC,
    AiPipelineJournalStatus,
    AiPipelineMetricName,
    AiPipelineRhythm,
} from '../constants/ai-snapshot.const';

/**
 * Провайдеры метрик конвейера (план 5.3, наблюдаемость). Регистр
 * prom-client общий с @lib/metrics, поэтому достаточно провайдеров в
 * модуле среза — MetricsModule.forRoot уже подключён в приложении.
 *
 * В метках только значения с малым числом вариантов (ритм и статус
 * прогона). Домена в метках нет: каждый портал создавал бы свой временной
 * ряд — портальный разрез смотрится по журналу `ai-analytics-etl-run`.
 */
export const AI_ANALYTICS_PIPELINE_METRIC_PROVIDERS = [
    makeHistogramProvider({
        name: AI_PIPELINE_METRIC.jobDuration,
        help: 'Длительность прогона ночного конвейера AI-аналитики, секунды',
        labelNames: ['rhythm', 'status'],
        buckets: [...AI_PIPELINE_DURATION_BUCKETS],
    }),
    makeCounterProvider({
        name: AI_PIPELINE_METRIC.rowsLoaded,
        help: 'Строк источников, загруженных шагами конвейера AI-аналитики',
        labelNames: ['rhythm'],
    }),
    makeCounterProvider({
        name: AI_PIPELINE_METRIC.bitrixCalls,
        help: 'Вызовов Bitrix REST шагами конвейера AI-аналитики',
        labelNames: ['rhythm'],
    }),
    makeCounterProvider({
        name: AI_PIPELINE_METRIC.llmPrice,
        help: 'Стоимость вызовов LLM в конвейере AI-аналитики, ₽',
        labelNames: ['rhythm'],
    }),
];

/**
 * Метрики прогона: сервис-обёртка, чтобы prom-client не протекал в раннер
 * и шаги (по образцу LibreOfficeMetricsService). Значения берутся из уже
 * посчитанного журнала — второй раз ничего не суммируется.
 *
 * Что смотреть в Grafana: ai_analytics_job_duration{status="failed"} > 0 —
 * ночь не досчиталась; рост ai_analytics_bitrix_calls при неизменном
 * ai_analytics_rows_loaded — шаги переспрашивают Битрикс.
 */
@Injectable()
export class AiAnalyticsPipelineMetrics {
    constructor(
        @InjectMetric(AI_PIPELINE_METRIC.jobDuration)
        private readonly duration: Histogram<string>,
        @InjectMetric(AI_PIPELINE_METRIC.rowsLoaded)
        private readonly rows: Counter<string>,
        @InjectMetric(AI_PIPELINE_METRIC.bitrixCalls)
        private readonly bitrixCalls: Counter<string>,
        @InjectMetric(AI_PIPELINE_METRIC.llmPrice)
        private readonly llmPrice: Counter<string>,
    ) {}

    /** Итог прогона: гистограмма длительности и три счётчика объёмов. */
    observeRun(
        rhythm: AiPipelineRhythm,
        status: AiPipelineJournalStatus,
        metrics: Record<AiPipelineMetricName, number>,
    ): void {
        this.duration
            .labels(rhythm, status)
            .observe(metrics[AI_PIPELINE_METRIC.jobDuration]);
        this.rows.labels(rhythm).inc(metrics[AI_PIPELINE_METRIC.rowsLoaded]);
        this.bitrixCalls
            .labels(rhythm)
            .inc(metrics[AI_PIPELINE_METRIC.bitrixCalls]);
        const price = metrics[AI_PIPELINE_METRIC.llmPrice];
        if (price > 0) this.llmPrice.labels(rhythm).inc(price);
    }
}
