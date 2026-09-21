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
 * `PBXModule` в импортах (и в транзитивных импортах ядра тоже: ядро без
 * Битрикса намеренно).
 *
 * Контроллер публикует единственный роут своей фичи: поверхность API
 * растёт ровно на него (ai/rules/app-api-surface.md). Настройки, кэш,
 * периметр и стор снапшотов — из ядра.
 */
import { Module } from '@nestjs/common';
import { PortalSessionModule } from '@lib/auth';
import { AiAnalyticsPlanController } from '../ai-analytics-plan.controller';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { DailyPlanUseCase } from '../domain/use-cases/daily-plan.use-case';

@Module({
    imports: [AiAnalyticsCoreModule, PortalSessionModule],
    controllers: [AiAnalyticsPlanController],
    providers: [DailyPlanUseCase],
    exports: [DailyPlanUseCase],
})
export class AiAnalyticsPlanModule {}
