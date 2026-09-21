/**
 * Модуль среза «история стадий и эпизоды сделок» (план Фазы 2, поток 13;
 * правило владения общими файлами §1.6 п. 2: срез объявляет собственный
 * `@Module`, сборка приложения его импортирует).
 *
 * Содержит один шаг ночного конвейера (`stage-history`, ритмы
 * `nightly|weekly|monthly|backfill`) и два загрузчика: историю стадий
 * воронки `sales_base` (курсор `>ID`, окна по месяцам, batch на ОДНОМ
 * инстансе `bitrix.api`) и сущности звонков из записей `ais` (без правки
 * `@lib/call-lib`).
 *
 * Контроллеров у среза нет — поверхность API не растёт
 * (ai/rules/app-api-surface.md). Кэш и стор снапшотов — из ядра
 * (`AiAnalyticsCoreModule`); инстанс Битрикс берётся внутри метода через
 * `PBXService.init(domain)`.
 */
import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { AiModule } from '@lib/call-lib';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { CallEntityLoader } from '../domain/loaders/call-entity.loader';
import { StageHistoryLoader } from '../domain/loaders/stage-history.loader';
import { StageHistoryStep } from '../steps/stage-history.step';

@Module({
    imports: [PBXModule, AiModule, AiAnalyticsCoreModule],
    providers: [StageHistoryLoader, CallEntityLoader, StageHistoryStep],
    exports: [StageHistoryStep],
})
export class AiAnalyticsStageHistoryModule {}
