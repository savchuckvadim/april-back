import { DynamicModule, Module, ModuleMetadata, Type } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { AiAnalyticsSnapshotScheduler } from '../cron/ai-analytics-snapshot.scheduler';
import { AiAnalyticsCalendarLoader } from '../domain/loaders/calendar.loader';
import { AiAnalyticsPassportModule } from '../passport/ai-analytics-passport.module';
import { AiAnalyticsPortalModelModule } from '../portal-model/ai-analytics-portal-model.module';
import { AiAnalyticsRopMarkModule } from '../rop-mark/ai-analytics-rop-mark.module';
import { AiAnalyticsSnapshotsModule } from '../snapshots/ai-analytics-snapshots.module';
import { AiAnalyticsStageHistoryModule } from '../stage-history/ai-analytics-stage-history.module';
import { CallsStep } from '../steps/calls.step';
import { FinanceStep } from '../steps/finance.step';
import { ForecastStep } from '../steps/forecast.step';
import { KpiStep } from '../steps/kpi.step';
import { PassportStep } from '../steps/passport.step';
import { PlansStep } from '../steps/plans.step';
import { PortalModelStep } from '../steps/portal-model.step';
import { RopMarkStep } from '../steps/rop-mark.step';
import { StageHistoryStep } from '../steps/stage-history.step';
import { StyleStep } from '../steps/style.step';
import { SanityStep } from '../steps/sanity.step';
import {
    AI_ANALYTICS_PIPELINE_STEPS,
    AI_ANALYTICS_SNAPSHOT_RUNNER,
    AiAnalyticsPipelineStep,
} from '../steps/step.types';
import { AI_ANALYTICS_PIPELINE_METRIC_PROVIDERS } from './ai-analytics.metrics';
import { AiAnalyticsPipelineMetrics } from './ai-analytics.metrics';
import { AiAnalyticsBackfillService } from './backfill.service';
import { EtlRunWriter } from './etl-run.writer';
import { AiPipelineRunContextFactory } from './run-context.factory';
import { SnapshotPipelineService } from './snapshot-pipeline.service';

/** Что подключить к конвейеру: модули шагов и сами классы шагов. */
export interface AiAnalyticsPipelineOptions {
    /** Модули срезов, экспортирующие свои шаги. */
    imports?: ModuleMetadata['imports'];
    /** Классы шагов в порядке выполнения. */
    steps: Type<AiAnalyticsPipelineStep>[];
}

/**
 * Порядок шагов ночного конвейера Фазы 2 — он же порядок массива под
 * токеном AI_ANALYTICS_PIPELINE_STEPS. Прямых зависимостей между шагами
 * нет: они общаются через шину (ключи — AI_PIPELINE_BUS_KEYS), поэтому
 * порядок здесь — единственная гарантия того, что читающий шаг увидит
 * значение писавшего. Закреплено `__tests__/pipeline-wiring.spec.ts`.
 *
 * Обоснование порядка (стрелка — ключ шины, кто пишет → кто читает):
 *  1. `calls` — источник строк разборов: пишет `calls.rows`, из шины
 *     ничего не читает, поэтому первый;
 *  2. `passport` — паспорт менеджера: читает `calls.rows` (прокси-дата
 *     первого события для каскада `since`), пишет `passport`;
 *  3. `stage-history` — эпизоды сделок: читает `calls.rows`; пишет
 *     `episodes`, `chain`, `stageTheta`, `cycleMedian`, `slaFacts`,
 *     `timestampLeak`, `historyMonths`;
 *  4. `kpi` — KPI-месяцы: пишет `kpi.months`;
 *  5. `style` — профиль стиля: читает `calls.rows` и полосы стажа из
 *     `passport`, пишет `style`;
 *  6. `plans` — снимок целей руководителя (тик 1-го числа): пишет `plans`;
 *  7. `finance` — закрывает месяц: читает `kpi.months`, `calls.rows`,
 *     `passport`, `plans`, `style`, `chain` — поэтому после всех
 *     источников месяца; пишет `finance.result` (читателя нет,
 *     @deprecated в словаре ключей);
 *  8. `rop-mark` — три звонка недели: читает `calls.rows`, в шину не
 *     пишет;
 *  9. `sanity` — санити-панель: читает `calls.rows`, `slaFacts`,
 *     `timestampLeak` (месячные снапшоты — через стор), пишет `sanity`;
 * 10. `portal-model` — модель портала: читает `calls.rows`, `chain`,
 *     `stageTheta`, `episodes`, `cycleMedian`, `historyMonths`,
 *     `passport` и отчёт панели `sanity` того же прогона — поэтому ПОСЛЕ
 *     панели; пишет `portalModel`;
 * 11. `forecast` — прогноз дня: читает `portalModel` (в ночном ритме,
 *     где модели в шине нет, — последнюю записанную), `historyMonths`,
 *     `chain`, `calls.rows`, `episodes`; в шину не пишет — последний.
 *
 * Ритмы объявляет сам шаг (константы `AI_*_RHYTHMS` срезов), раннер
 * фильтрует массив по ритму прогона, порядок внутри ритма — порядок
 * массива:
 * - nightly — calls, passport, stage-history, kpi, finance, forecast;
 * - weekly — calls, passport, stage-history, rop-mark, sanity;
 * - monthly — calls, passport, stage-history, kpi, style, plans, finance,
 *   sanity, portal-model;
 * - backfill — calls, passport, stage-history, kpi, finance, portal-model:
 *   догон месяцев с паспортом из кэша, без похода в портал за планами;
 *   модель портала пересчитывается по догнанным месяцам.
 */
export const AI_ANALYTICS_PIPELINE_STEP_ORDER: Type<AiAnalyticsPipelineStep>[] =
    [
        CallsStep,
        PassportStep,
        StageHistoryStep,
        KpiStep,
        StyleStep,
        PlansStep,
        FinanceStep,
        RopMarkStep,
        SanityStep,
        PortalModelStep,
        ForecastStep,
    ];

/**
 * Модули срезов, экспортирующие шаги из порядка выше. `SanityStep` в
 * списке нет намеренно: он объявлен провайдером самого конвейера.
 */
export const AI_ANALYTICS_PIPELINE_STEP_MODULES: Type<unknown>[] = [
    AiAnalyticsSnapshotsModule,
    AiAnalyticsPassportModule,
    AiAnalyticsStageHistoryModule,
    AiAnalyticsRopMarkModule,
    AiAnalyticsPortalModelModule,
];

/**
 * Модуль среза «ночной конвейер» (правило владения общими файлами §1.6
 * п. 2: срез объявляет собственный @Module, сборка приложения его
 * импортирует — так корневой модуль фичи не растёт).
 *
 * Срез содержит планировщик ритмов, раннер, журнал, метрики и загрузчик
 * производственного календаря; общие загрузчики (настройки, параметры,
 * ростер, порталы, стор снапшотов) приходят из ядра
 * (`AiAnalyticsCoreModule`), которое конвейер не импортирует обратно —
 * циклов нет.
 *
 * Порядок шагов задаёт `register()`; собственный шаг среза (санити-панель)
 * объявлен здесь и экспортируется, чтобы сборке осталось поставить его
 * после наполнивших шину шагов и перед моделью портала, которая читает
 * его отчёт.
 *
 * Шаги в @Module не перечислены: их приносит `register()`. По умолчанию
 * массив шагов пуст — конвейер отрабатывает вхолостую и пишет журнал с
 * нулём шагов, а не падает.
 */
@Module({
    imports: [PBXModule, QueueModule, AiAnalyticsCoreModule],
    providers: [
        AiAnalyticsCalendarLoader,
        ...AI_ANALYTICS_PIPELINE_METRIC_PROVIDERS,
        AiAnalyticsPipelineMetrics,
        EtlRunWriter,
        AiPipelineRunContextFactory,
        SnapshotPipelineService,
        AiAnalyticsBackfillService,
        AiAnalyticsSnapshotScheduler,
        SanityStep,
        { provide: AI_ANALYTICS_PIPELINE_STEPS, useValue: [] },
        {
            provide: AI_ANALYTICS_SNAPSHOT_RUNNER,
            useExisting: SnapshotPipelineService,
        },
    ],
    exports: [
        SnapshotPipelineService,
        AiAnalyticsBackfillService,
        SanityStep,
        AI_ANALYTICS_SNAPSHOT_RUNNER,
    ],
})
export class AiAnalyticsPipelineModule {
    /**
     * Конвейер с шагами: модули шагов приходят в `imports` и экспортируют
     * свои классы, фабрика собирает из них массив под DI-токеном в
     * порядке передачи (порядок шагов = порядок массива). Провайдер
     * динамического модуля объявлен после статического пустого массива и
     * потому побеждает — переопределять @Module не нужно.
     */
    static register(options: AiAnalyticsPipelineOptions): DynamicModule {
        return {
            module: AiAnalyticsPipelineModule,
            imports: options.imports ?? [],
            providers: [
                {
                    provide: AI_ANALYTICS_PIPELINE_STEPS,
                    useFactory: (
                        ...steps: AiAnalyticsPipelineStep[]
                    ): AiAnalyticsPipelineStep[] => steps,
                    inject: options.steps,
                },
            ],
        };
    }

    /**
     * Конвейер Фазы 2 «как в проде»: все модули срезов и все их шаги в
     * порядке AI_ANALYTICS_PIPELINE_STEP_ORDER. Сборка приложения
     * (`ai-analytics.module.ts`) импортирует
     * `AiAnalyticsPipelineModule.registerPhase2()` — состав и порядок
     * шагов живут здесь, а не в корневом модуле фичи.
     */
    static registerPhase2(): DynamicModule {
        return AiAnalyticsPipelineModule.register({
            imports: AI_ANALYTICS_PIPELINE_STEP_MODULES,
            steps: AI_ANALYTICS_PIPELINE_STEP_ORDER,
        });
    }
}
