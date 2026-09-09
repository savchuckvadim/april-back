/**
 * Модуль среза «три звонка недели» (план Фазы 2, поток 15; правило
 * владения общими файлами §1.6 п. 2).
 *
 * Недельный шаг конвейера `rop-mark` подбирает руководителю три звонка
 * (неуверенный тип, лучший балл, случайный) детерминированно по зерну
 * `seedOf(domain, weekKey)` и пишет подбор записью `ai-analytics-rop-mark`
 * в `ais`. Сценарий `RopMarkUseCase` (pick / list / save) экспортируется
 * для будущей ручки: контроллер появится в волне ручек Фазы 2, здесь его
 * нет — поверхность API не растёт (ai/rules/app-api-surface.md).
 *
 * Периметр и настройки нужны сценарию, а не шагу, поэтому
 * `RequesterAccessService`, `SettingsLoader` и `CallsLoader` объявлены
 * здесь же: провайдеры без состояния, кэш общий (AppCache/Redis).
 */
import { Module } from '@nestjs/common';
import { AiModule, CallReportAnalyticsCoreModule } from '@lib/call-lib';
import { BxDepartmentModule } from '@lib/bx-department';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { CallsLoader } from '../domain/loaders/calls.loader';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { RopMarkUseCase } from '../domain/use-cases/rop-mark.use-case';
import { RopMarkStep } from '../steps/rop-mark.step';
import { AiAnalyticsRopMarkStore } from '../store/ai-analytics-rop-mark.store';

@Module({
    imports: [
        CallReportAnalyticsCoreModule,
        PortalAppSettingsModule,
        BxDepartmentModule,
        AiModule,
    ],
    providers: [
        AiAnalyticsCacheService,
        SettingsLoader,
        CallsLoader,
        RequesterAccessService,
        AiAnalyticsRopMarkStore,
        RopMarkUseCase,
        RopMarkStep,
    ],
    exports: [RopMarkStep, RopMarkUseCase, AiAnalyticsRopMarkStore],
})
export class AiAnalyticsRopMarkModule {}
