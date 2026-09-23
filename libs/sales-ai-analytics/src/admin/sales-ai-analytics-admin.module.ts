import { Module } from '@nestjs/common';
import { AiAnalyticsAuditAdminController } from './controllers/audit.admin.controller';
import { AiAnalyticsFeedbackCostAdminController } from './controllers/feedback-cost.admin.controller';
import { AiAnalyticsGoldenSetAdminController } from './controllers/golden-set.admin.controller';
import { AiAnalyticsPipelineAdminController } from './controllers/pipeline.admin.controller';
import { AiAnalyticsRetentionAdminController } from './controllers/retention.admin.controller';
import { SalesAiAnalyticsAuditModule } from './sales-ai-analytics-audit.module';
import { SalesAiAnalyticsOpsModule } from './sales-ai-analytics-ops.module';
import { SalesAiAnalyticsProbeModule } from './sales-ai-analytics-probe.module';

/**
 * Админ-слой AI-аналитики ОП (план, 6.1; Фаза 3, П5): только контроллеры
 * поверх трёх сервисных модулей — `SalesAiAnalyticsAuditModule` (аудит
 * данных Фазы 0), `SalesAiAnalyticsProbeModule` (проба истории стадий
 * через PBXService) и `SalesAiAnalyticsOpsModule` (эксплуатация: очередь
 * конвейера, состояние прогонов, ретенция, расход модели, обратная связь,
 * золотой набор).
 *
 * Контроллеры разрезаны по темам (правило 200–300 строк на файл), путь
 * `admin/ai-analytics` и защита у них общие — `controllers/
 * admin-controller.const.ts`.
 *
 * Подключать ТОЛЬКО в apps/admin — иначе роуты admin/ai-analytics/* и
 * поддеревья PBXModule/QueueModule утекут в kpi-report-sales и
 * event-sales (ai/rules/app-api-surface.md). Защита — глобальные гарды
 * @lib/auth плюс явные @UseGuards в каждом контроллере, роль SUPER_USER.
 *
 * Крона ретенции здесь нет: он требует ScheduleModule.forRoot(), которого
 * в apps/admin нет — см. `sales-ai-analytics-retention-cron.module.ts`.
 */
@Module({
    imports: [
        SalesAiAnalyticsAuditModule,
        SalesAiAnalyticsProbeModule,
        SalesAiAnalyticsOpsModule,
    ],
    controllers: [
        AiAnalyticsAuditAdminController,
        AiAnalyticsPipelineAdminController,
        AiAnalyticsRetentionAdminController,
        AiAnalyticsFeedbackCostAdminController,
        AiAnalyticsGoldenSetAdminController,
    ],
})
export class SalesAiAnalyticsAdminModule {}
