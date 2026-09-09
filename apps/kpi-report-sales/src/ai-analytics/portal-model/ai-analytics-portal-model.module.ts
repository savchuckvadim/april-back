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
 * ⚠ Порядок шагов в месячном ритме: `portal-model` идёт ПОСЛЕ `finance`
 * (месяц уже закрыт) и после `stage-history` (стадийные θ и эпизоды — в
 * шине). Ночной `forecast` читает модель из шины либо последнюю
 * записанную. Массив шагов собирает поток сборки — здесь шаги только
 * объявлены и экспортированы.
 *
 * Контроллеров срез не публикует: поверхность API не растёт
 * (ai/rules/app-api-surface.md).
 */
import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { AiModule } from '@lib/call-lib';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { AiAnalyticsParamsLoader } from '../domain/loaders/params.loader';
import { PortalModelLoader } from '../domain/loaders/portal-model.loader';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { PortalModelUseCase } from '../domain/use-cases/portal-model.use-case';
import { ForecastStep } from '../steps/forecast.step';
import { PortalModelStep } from '../steps/portal-model.step';
import { AiAnalyticsSettingsStore } from '../store/ai-analytics-settings.store';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';

@Module({
    imports: [PBXModule, PortalAppSettingsModule, AiModule],
    providers: [
        SettingsLoader,
        AiAnalyticsParamsLoader,
        PortalModelLoader,
        AiAnalyticsSnapshotStore,
        AiAnalyticsSettingsStore,
        PortalModelUseCase,
        PortalModelStep,
        ForecastStep,
    ],
    exports: [PortalModelStep, ForecastStep, PortalModelUseCase],
})
export class AiAnalyticsPortalModelModule {}
