/**
 * Сервисный модуль панели «Запуск AI после выкладки» — БЕЗ контроллеров
 * (ai/rules/app-api-surface.md): сброс кэша витрины, флаги ступеней и
 * сводка состояния запуска. Контроллер подключает
 * `SalesAiAnalyticsAdminModule` только в apps/admin.
 *
 * Зависимости:
 * - `SalesAiAnalyticsOpsModule` — снапшоты (проверка точности, журнал
 *   прогонов, переразбор, расход модели);
 * - `AppCacheServiceModule` — центральный кэш (тот же, что пишет
 *   kpi-report-sales); модуль @Global и без контроллеров, роуты
 *   app-cache в админку не попадают;
 * - `PortalStoreModule` — портал по домену, настройки kpiSales
 *   (реэкспорт `PortalAppSettingsModule`) и настройки AI портала;
 * - `PbxAicallSmartModule` — резолв смарта «AI-анализ звонков»;
 * - `TranscriptionStoreModule` — день первой готовой транскрипции.
 */
import { Module } from '@nestjs/common';
import { AppCacheServiceModule } from '@lib/app-cache';
import { TranscriptionStoreModule } from '@lib/call-lib';
import { PbxAicallSmartModule } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { SalesAiAnalyticsOpsModule } from '../sales-ai-analytics-ops.module';
import { AiAnalyticsLaunchCacheService } from './services/ai-analytics-launch-cache.service';
import { AiAnalyticsLaunchStageFlagsService } from './services/ai-analytics-launch-stage-flags.service';
import { AiAnalyticsLaunchStatusService } from './services/ai-analytics-launch-status.service';

@Module({
    imports: [
        SalesAiAnalyticsOpsModule,
        AppCacheServiceModule,
        PortalStoreModule,
        PbxAicallSmartModule,
        TranscriptionStoreModule,
    ],
    providers: [
        AiAnalyticsLaunchCacheService,
        AiAnalyticsLaunchStageFlagsService,
        AiAnalyticsLaunchStatusService,
    ],
    exports: [
        AiAnalyticsLaunchCacheService,
        AiAnalyticsLaunchStageFlagsService,
        AiAnalyticsLaunchStatusService,
    ],
})
export class SalesAiAnalyticsLaunchModule {}
