/**
 * Модуль среза «модель портала и прогноз» (план Фазы 2, поток 16a;
 * правило владения общими файлами §1.6 п. 2: срез объявляет собственный
 * `@Module`, сборка приложения его импортирует — корневой модуль фичи не
 * растёт, а потоки не конфликтуют за один файл).
 *
 * Содержит два шага ночного конвейера и то, что им нужно: месячный
 * `portal-model` (нормы слоёв, κ, качество, потолок, шкала лага,
 * готовность, автособытия журнала) и ночной `forecast` (P50, наивные
 * базы, ожидание от пайплайна, план дня, рычаги, утечки).
 *
 * ⚠ Порядок шагов: `portal-model` идёт ПОСЛЕ `finance` (месяц уже
 * закрыт), после `stage-history` (стадийные θ и эпизоды — в шине) и
 * после `sanity` (панель кладёт свой отчёт в шину под ключом `sanity`,
 * модель встраивает его в поле `sanity` того же прогона). `forecast`
 * идёт последним: читает модель из шины (`portalModel`) либо последнюю
 * записанную. Массив шагов собирает `AI_ANALYTICS_PIPELINE_STEP_ORDER`
 * в модуле конвейера — здесь шаги только объявлены и экспортированы.
 *
 * Контроллеров срез не публикует: поверхность API не растёт
 * (ai/rules/app-api-surface.md). Настройки, параметры и стор снапшотов —
 * из ядра; стор настроек портала (нужен PortalService) — из его
 * PBX-половины; свой здесь только загрузчик модели.
 */
import { Module } from '@nestjs/common';
import { AiAnalyticsCorePbxModule } from '../core/ai-analytics-core-pbx.module';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { PortalModelLoader } from '../domain/loaders/portal-model.loader';
import { PortalModelUseCase } from '../domain/use-cases/portal-model.use-case';
import { ForecastStep } from '../steps/forecast.step';
import { PortalModelStep } from '../steps/portal-model.step';

@Module({
    imports: [AiAnalyticsCoreModule, AiAnalyticsCorePbxModule],
    providers: [
        PortalModelLoader,
        PortalModelUseCase,
        PortalModelStep,
        ForecastStep,
    ],
    exports: [PortalModelStep, ForecastStep, PortalModelUseCase],
})
export class AiAnalyticsPortalModelModule {}
