/**
 * Модуль среза «история стадий и эпизоды сделок» (план Фазы 2, поток 13;
 * правило владения общими файлами §1.6 п. 2: срез объявляет собственный
 * `@Module`, сборка приложения его импортирует).
 *
 * Содержит один шаг ночного конвейера (`stage-history`) и два загрузчика:
 * историю стадий воронки `sales_base` (курсор `>ID`, окна по месяцам,
 * batch на ОДНОМ инстансе `bitrix.api`) и сущности звонков из записей
 * `ais` (без правки `@lib/call-lib`).
 *
 * Контроллеров у среза нет — поверхность API не растёт
 * (ai/rules/app-api-surface.md). Загрузчики продублированы с корневым
 * модулем осознанно: они без состояния (инстанс Битрикс берётся внутри
 * метода через `PBXService.init(domain)`), кэш общий — AppCache/Redis.
 */
import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { AiModule } from '@lib/call-lib';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import { CallEntityLoader } from '../domain/loaders/call-entity.loader';
import { StageHistoryLoader } from '../domain/loaders/stage-history.loader';
import { StageHistoryStep } from '../steps/stage-history.step';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';

@Module({
    imports: [PBXModule, AiModule],
    providers: [
        AiAnalyticsCacheService,
        StageHistoryLoader,
        CallEntityLoader,
        AiAnalyticsSnapshotStore,
        StageHistoryStep,
    ],
    exports: [StageHistoryStep],
})
export class AiAnalyticsStageHistoryModule {}
