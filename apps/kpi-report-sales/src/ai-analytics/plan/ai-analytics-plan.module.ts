/**
 * Модуль среза «план дня» (план Фазы 2, поток 17; правило владения
 * общими файлами §1.6 п. 2: срез объявляет собственный `@Module`, сборка
 * приложения его импортирует — корневой модуль фичи не растёт, а потоки
 * волны не конфликтуют за один файл).
 *
 * Содержит ровно одну ручку `POST ai-analytics/plan/daily` и сценарий
 * под неё. Очереди и WS здесь нет: ответ синхронный, потому что все
 * входы уже лежат в `ais` (прогноз дня, модель портала, месяц
 * менеджера), а Битрикс не вызывается вовсе — отсюда и отсутствие
 * `PBXModule` в импортах.
 *
 * Контроллер публикует единственный роут своей фичи: поверхность API
 * растёт ровно на него (ai/rules/app-api-surface.md).
 */
import { Module } from '@nestjs/common';
import { AiModule } from '@lib/call-lib';
import { BxDepartmentModule } from '@lib/bx-department';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { AiAnalyticsPlanController } from '../ai-analytics-plan.controller';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { DailyPlanUseCase } from '../domain/use-cases/daily-plan.use-case';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';

@Module({
    imports: [PortalAppSettingsModule, BxDepartmentModule, AiModule],
    controllers: [AiAnalyticsPlanController],
    providers: [
        AiAnalyticsCacheService,
        SettingsLoader,
        RequesterAccessService,
        AiAnalyticsSnapshotStore,
        DailyPlanUseCase,
    ],
    exports: [DailyPlanUseCase],
})
export class AiAnalyticsPlanModule {}
