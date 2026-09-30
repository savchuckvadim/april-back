/**
 * Сервисный модуль эксплуатации AI-аналитики ОП (план Фазы 3, П5):
 * read-only стор снапшотов, состояние конвейера, ретенция, расход модели,
 * обратная связь, золотой набор и чтение снапшотов Фазы 4 (пул, β,
 * точность прогноза, эффект советов) — БЕЗ контроллеров
 * (ai/rules/app-api-surface.md). Контроллеры подключает
 * `SalesAiAnalyticsAdminModule` только в `apps/admin`.
 *
 * `QueueModule` здесь нужен ради `QueueDispatcherService`: админ-ручки
 * ставят джобы в общую очередь `SALES_KPI_REPORT` (решение владельца В2
 * от 22.09.2026) — тот же Redis, тот же воркер в kpi-report-sales.
 * Модуль без контроллеров, поверхность API приложения не растёт.
 *
 * `PortalAppSettingsModule` — ростер порталов для крона ретенции.
 *
 * ⚠ Крон ретенции (`AiAnalyticsRetentionScheduler`) сюда НЕ включён
 * намеренно: он требует `ScheduleModule.forRoot()` в приложении, а без
 * него `@Cron` молча не срабатывает. Подключать его надо отдельным
 * `SalesAiAnalyticsRetentionCronModule` и только в приложении, где
 * планировщик уже поднят.
 */
import { Module } from '@nestjs/common';
import { AiModule } from '@lib/call-lib';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { QueueModule } from '@lib/queue';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { AiAnalyticsAdminSnapshotStore } from './ai-analytics-admin-snapshot.store';
import { AiAnalyticsCostService } from './services/ai-analytics-cost.service';
import { AiAnalyticsEtlStatusService } from './services/ai-analytics-etl-status.service';
import { AiAnalyticsFeedbackSummaryService } from './services/ai-analytics-feedback-summary.service';
import { AiAnalyticsGoldenSetService } from './services/ai-analytics-golden-set.service';
import { AiAnalyticsPhase4StatusService } from './services/ai-analytics-phase4-status.service';
import { AiAnalyticsPipelineAdminService } from './services/ai-analytics-pipeline-admin.service';
import { AiAnalyticsRetentionService } from './services/ai-analytics-retention.service';

@Module({
    imports: [PrismaModule, AiModule, QueueModule, PortalAppSettingsModule],
    providers: [
        AiAnalyticsAdminSnapshotStore,
        AiAnalyticsPipelineAdminService,
        AiAnalyticsEtlStatusService,
        AiAnalyticsRetentionService,
        AiAnalyticsCostService,
        AiAnalyticsFeedbackSummaryService,
        AiAnalyticsGoldenSetService,
        AiAnalyticsPhase4StatusService,
    ],
    exports: [
        AiAnalyticsAdminSnapshotStore,
        AiAnalyticsPipelineAdminService,
        AiAnalyticsEtlStatusService,
        AiAnalyticsRetentionService,
        AiAnalyticsCostService,
        AiAnalyticsFeedbackSummaryService,
        AiAnalyticsGoldenSetService,
        AiAnalyticsPhase4StatusService,
    ],
})
export class SalesAiAnalyticsOpsModule {}
