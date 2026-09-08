/**
 * Модуль среза «менеджерские снапшоты» (план Фазы 2, §1.6 п. 2: срез
 * объявляет собственный `@Module`, сборка приложения его импортирует —
 * так корневой модуль фичи не растёт и потоки не конфликтуют).
 *
 * Содержит четыре шага ночного конвейера и загрузчики, которые им нужны:
 * звонки (недельный снапшот и строки в шину), KPI-месяцы, стиль
 * (`ai-analytics-style`) и финансы (они же закрывают месяц —
 * `ai-analytics-manager-month`).
 *
 * ⚠ Порядок шагов в месячном ритме: `calls` → `kpi` → `style` →
 * `finance`. Финансы идут последними, потому что нагрузку месяца они
 * собирают из шины: разборы, KPI-факты, паспорт (поток 14a), снимок
 * планов и профиль стиля. Массив шагов собирает поток сборки
 * (`AiAnalyticsPipelineModule.register`) — здесь шаги только объявлены и
 * экспортированы.
 *
 * Загрузчики продублированы с корневым модулем осознанно: они без
 * состояния, а кэш у них общий (AppCache/Redis), зато срез не тянет за
 * собой контроллеры фичи.
 */
import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { AiModule, CallReportAnalyticsCoreModule } from '@lib/call-lib';
import { BxDepartmentModule } from '@lib/bx-department';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import { CallsLoader } from '../domain/loaders/calls.loader';
import { FinanceLoader } from '../domain/loaders/finance.loader';
import { KpiLoader } from '../domain/loaders/kpi.loader';
import { ManagersLoader } from '../domain/loaders/managers.loader';
import { SalesFinanceUseCaseFactory } from '../domain/loaders/sales-finance-use-case.factory';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { CallsStep } from '../steps/calls.step';
import { FinanceStep } from '../steps/finance.step';
import { KpiStep } from '../steps/kpi.step';
import { StyleStep } from '../steps/style.step';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';

@Module({
    imports: [
        PBXModule,
        CallReportAnalyticsCoreModule,
        PortalAppSettingsModule,
        BxDepartmentModule,
        AiModule,
    ],
    providers: [
        AiAnalyticsCacheService,
        SettingsLoader,
        ManagersLoader,
        CallsLoader,
        KpiLoader,
        SalesFinanceUseCaseFactory,
        FinanceLoader,
        AiAnalyticsSnapshotStore,
        CallsStep,
        KpiStep,
        StyleStep,
        FinanceStep,
    ],
    exports: [CallsStep, KpiStep, StyleStep, FinanceStep],
})
export class AiAnalyticsSnapshotsModule {}
