/**
 * Модуль среза «Досье менеджера» (план Фазы 3, поток П4; правило
 * владения общими файлами §1.6 п. 2: срез объявляет собственный
 * `@Module`, сборка приложения его импортирует — корневой модуль фичи не
 * растёт и потоки не конфликтуют).
 *
 * Содержит ручку `POST /ai-analytics/dossier`, два use-case'а (конверт
 * ручки и выполнение джобы) и загрузчик источников.
 *
 * Поверхность API: `QueueModule` (постановка джобы) и
 * `AiAnalyticsCoreModule` (кэш, настройки, ростер, стор снапшотов, стор
 * обратной связи, периметр) контроллеров не несут. Стор меток
 * руководителя и загрузчик отказа от профилирования досье НЕ объявляет
 * заново, а берёт у их владельцев — `AiAnalyticsRopMarkModule` и
 * `AiAnalyticsStyleModule` (правило «общий провайдер объявлен один раз»,
 * его закрепляет `__tests__/ai-analytics-module-di.spec.ts`). Роуты этих
 * двух срезов приложение публикует и без досье: оба модуля уже в
 * `ai-analytics.module.ts`, поэтому поверхность API не растёт
 * (ai/rules/app-api-surface.md).
 *
 * PBXModule здесь не нужен и напрямую не импортируется: досье собирается
 * из `ais`, в Битрикс не ходит. `WsService` глобален (`@Global`
 * WsModule), поэтому отдельного импорта не требует — как у среза резюме.
 *
 * Все провайдеры — @Injectable без bitrix-состояния (CLAUDE.md про race
 * condition): домен приходит параметром запроса или джобы.
 */
import { Module } from '@nestjs/common';
import { QueueModule } from 'src/modules/queue/queue.module';
import { PortalSessionModule } from '@lib/auth';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { DossierSourcesLoader } from '../domain/loaders/dossier-sources.loader';
import { DossierJobUseCase } from '../domain/use-cases/dossier-job.use-case';
import { DossierUseCase } from '../domain/use-cases/dossier.use-case';
import { AiAnalyticsRopMarkModule } from '../rop-mark/ai-analytics-rop-mark.module';
import { AiAnalyticsStyleModule } from '../style/ai-analytics-style.module';
import { AiAnalyticsDossierController } from './ai-analytics-dossier.controller';

@Module({
    imports: [
        QueueModule,
        AiAnalyticsCoreModule,
        AiAnalyticsRopMarkModule,
        AiAnalyticsStyleModule,
        PortalSessionModule,
    ],
    controllers: [AiAnalyticsDossierController],
    providers: [DossierSourcesLoader, DossierUseCase, DossierJobUseCase],
    // Джоба досье нужна процессору очереди (поток сборки), конверт ручки —
    // соседним срезам.
    exports: [DossierUseCase, DossierJobUseCase],
})
export class AiAnalyticsDossierModule {}
