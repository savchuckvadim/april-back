/**
 * Модуль среза «три звонка недели» (план Фазы 2, поток 15; правило
 * владения общими файлами §1.6 п. 2).
 *
 * Недельный шаг конвейера `rop-mark` подбирает руководителю три звонка
 * (неуверенный тип, лучший балл, случайный) детерминированно по зерну
 * `seedOf(domain, weekKey)` и пишет подбор записью `ai-analytics-rop-mark`
 * в `ais`. Сценарий `RopMarkUseCase` (pick / list / save) обслуживает
 * ручки `rop-mark/pick|list|save` контроллера этого же среза (поток 19,
 * сборка): поверхность API растёт ровно на эти три роута
 * (ai/rules/app-api-surface.md).
 *
 * Периметр, настройки, кэш и лёгкая выборка звонков — из ядра
 * (`AiAnalyticsCoreModule`); свой здесь только стор подбора и меток.
 */
import { Module } from '@nestjs/common';
import { PortalSessionModule } from '@lib/auth';
import { AiModule } from '@lib/call-lib';
import { AiAnalyticsRopMarkController } from '../ai-analytics-rop-mark.controller';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { RopMarkUseCase } from '../domain/use-cases/rop-mark.use-case';
import { RopMarkStep } from '../steps/rop-mark.step';
import { AiAnalyticsRopMarkStore } from '../store/ai-analytics-rop-mark.store';

@Module({
    imports: [AiModule, AiAnalyticsCoreModule, PortalSessionModule],
    controllers: [AiAnalyticsRopMarkController],
    providers: [AiAnalyticsRopMarkStore, RopMarkUseCase, RopMarkStep],
    exports: [RopMarkStep, RopMarkUseCase, AiAnalyticsRopMarkStore],
})
export class AiAnalyticsRopMarkModule {}
