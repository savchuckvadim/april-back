import { DynamicModule, Module, ModuleMetadata, Type } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { AiModule } from '@lib/call-lib';
import { BxDepartmentModule } from '@lib/bx-department';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import { AiAnalyticsSnapshotScheduler } from '../cron/ai-analytics-snapshot.scheduler';
import { AiAnalyticsCalendarLoader } from '../domain/loaders/calendar.loader';
import { ManagersLoader } from '../domain/loaders/managers.loader';
import { AiAnalyticsParamsLoader } from '../domain/loaders/params.loader';
import { AiAnalyticsPortalsLoader } from '../domain/loaders/portals.loader';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { AiAnalyticsPassportModule } from '../passport/ai-analytics-passport.module';
import { AiAnalyticsRopMarkModule } from '../rop-mark/ai-analytics-rop-mark.module';
import { AiAnalyticsSnapshotsModule } from '../snapshots/ai-analytics-snapshots.module';
import { AiAnalyticsStageHistoryModule } from '../stage-history/ai-analytics-stage-history.module';
import { CallsStep } from '../steps/calls.step';
import { FinanceStep } from '../steps/finance.step';
import { KpiStep } from '../steps/kpi.step';
import { PassportStep } from '../steps/passport.step';
import { PlansStep } from '../steps/plans.step';
import { RopMarkStep } from '../steps/rop-mark.step';
import { StageHistoryStep } from '../steps/stage-history.step';
import { StyleStep } from '../steps/style.step';
import { SanityStep } from '../steps/sanity.step';
import {
    AI_ANALYTICS_PIPELINE_STEPS,
    AI_ANALYTICS_SNAPSHOT_RUNNER,
    AiAnalyticsPipelineStep,
} from '../steps/step.types';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
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
 * Порядок шагов ночного конвейера Фазы 2 (волна 4, сборка) — он же
 * порядок массива под токеном AI_ANALYTICS_PIPELINE_STEPS. Прямых
 * зависимостей между шагами нет: они общаются через шину, поэтому
 * порядок здесь — единственная гарантия того, что читающий шаг увидит
 * значение писавшего.
 *
 * Обоснование порядка (стрелка — ключ шины, кто пишет → кто читает):
 * 1. `calls` — источник строк разборов (`calls.rows`), сам из шины
 *    ничего не читает, поэтому идёт первым;
 * 2. `passport` — паспорт менеджера; из `calls.rows` берёт прокси-дату
 *    первого события для каскада `since`, публикует `passport`;
 * 3. `stage-history` — эпизоды сделок из `calls.rows` и истории стадий;
 *    публикует `episodes`, `chain`, `stageTheta`, `cycleMedian`,
 *    `slaFacts`, `timestampLeak`, `historyMonths` — их ждут финансы и
 *    будущая модель портала с прогнозом;
 * 4. `kpi` — KPI-месяцы (`kpi.months`) для месячного снапшота;
 * 5. `style` — профиль стиля: читает `calls.rows` и полосы стажа из
 *    `passport`, публикует `style`;
 * 6. `plans` — снимок целей руководителя 1-го числа, публикует `plans`;
 * 7. `finance` — закрывает месяц: читает `kpi.months`, `calls.rows`,
 *    `passport`, `plans`, `style` и `chain`, поэтому идёт после всех;
 * 8. `rop-mark` — недельный подбор трёх звонков из `calls.rows`; на
 *    месячную цепочку не влияет;
 * 9. `sanity` — недельная санити-панель, читает шину целиком, поэтому
 *    последняя (правило потока 12).
 *
 * Ритмы объявляет сам шаг, раннер фильтрует массив по ритму прогона:
 * `backfill` выполняют `calls`, `stage-history`, `kpi` и `finance` —
 * догон месяцев без похода в портал за паспортом и планами.
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
];

/**
 * Модуль среза «ночной конвейер» (правило владения общими файлами §1.6
 * п. 2: срез объявляет собственный @Module, сборка приложения его
 * импортирует — так корневой модуль фичи не растёт).
 *
 * Срез самодостаточен (планировщик ритмов, раннер, журнал, метрики и все
 * нужные им загрузчики): они объявлены здесь, а не взяты из
 * AiAnalyticsModule — иначе получилась бы циклическая связь (сборка
 * импортирует конвейер, а конвейер — сборку). Загрузчики без состояния,
 * второй экземпляр безопасен: кэш у них общий (AppCache/Redis).
 *
 * Порядок шагов задаёт `register()` потока сборки; собственный шаг среза
 * (недельная санити-панель) объявлен здесь и экспортируется, чтобы сборке
 * осталось только поставить его последним в недельном ритме — панель
 * читает шину, значит должна идти после наполнивших её шагов.
 *
 * Шаги в @Module не перечислены: их приносит `register()` из потока
 * сборки. По умолчанию массив шагов пуст — конвейер отрабатывает вхолостую
 * и пишет журнал с нулём шагов, а не падает.
 */
@Module({
    imports: [
        PBXModule,
        QueueModule,
        PortalAppSettingsModule,
        BxDepartmentModule,
        AiModule,
    ],
    providers: [
        AiAnalyticsCacheService,
        SettingsLoader,
        AiAnalyticsParamsLoader,
        ManagersLoader,
        AiAnalyticsPortalsLoader,
        AiAnalyticsCalendarLoader,
        AiAnalyticsSnapshotStore,
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
     * Конвейер Фазы 2 «как в проде»: все модули срезов волны 4 и все их
     * шаги в порядке AI_ANALYTICS_PIPELINE_STEP_ORDER. Сборке приложения
     * остаётся импортировать `AiAnalyticsPipelineModule.registerPhase2()`
     * — состав и порядок шагов живут здесь, а не в корневом модуле фичи.
     */
    static registerPhase2(): DynamicModule {
        return AiAnalyticsPipelineModule.register({
            imports: AI_ANALYTICS_PIPELINE_STEP_MODULES,
            steps: AI_ANALYTICS_PIPELINE_STEP_ORDER,
        });
    }
}
