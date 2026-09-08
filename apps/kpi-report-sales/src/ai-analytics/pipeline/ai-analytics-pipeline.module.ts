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
}
