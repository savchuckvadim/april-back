/**
 * Модуль среза «менеджерские снапшоты» (план Фазы 2, §1.6 п. 2: срез
 * объявляет собственный `@Module`, сборка приложения его импортирует —
 * так корневой модуль фичи не растёт и потоки не конфликтуют).
 *
 * Содержит четыре шага ночного конвейера: звонки (недельный снапшот и
 * строки в шину), KPI-месяцы, стиль (`ai-analytics-style`) и финансы
 * (они же закрывают месяц — `ai-analytics-manager-month`).
 *
 * ⚠ Порядок шагов в месячном ритме: `calls` → `kpi` → `style` →
 * `finance`. Финансы идут последними, потому что нагрузку месяца они
 * собирают из шины: разборы, KPI-факты, паспорт (поток 14a), снимок
 * планов и профиль стиля. Массив шагов собирает поток сборки
 * (`AiAnalyticsPipelineModule.register`) — здесь шаги только объявлены и
 * экспортированы.
 *
 * Загрузчики шагов приходят из ядра (`core/`): разборы, стор снапшотов —
 * из `AiAnalyticsCoreModule`, KPI и финансы (нужен PBXService) — из
 * `AiAnalyticsCorePbxModule`. Собственных копий провайдеров у среза нет.
 */
import { Module } from '@nestjs/common';
import { AiAnalyticsCorePbxModule } from '../core/ai-analytics-core-pbx.module';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { CallsStep } from '../steps/calls.step';
import { FinanceStep } from '../steps/finance.step';
import { KpiStep } from '../steps/kpi.step';
import { StyleStep } from '../steps/style.step';

@Module({
    imports: [AiAnalyticsCoreModule, AiAnalyticsCorePbxModule],
    providers: [CallsStep, KpiStep, StyleStep, FinanceStep],
    exports: [CallsStep, KpiStep, StyleStep, FinanceStep],
})
export class AiAnalyticsSnapshotsModule {}
