import { Module } from '@nestjs/common';
import { PortalSessionModule } from '@lib/auth';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { AiAnalyticsAboutController } from './ai-analytics-about.controller';
import { AiAnalyticsAboutUseCase } from './ai-analytics-about.use-case';

/**
 * Срез «Как считаем» (план Фазы 2 §6, долг 26): ручка `ai-analytics/about`
 * с блоком по реестру параметров и снапшоту модели портала.
 *
 * Собственный @Module по правилу владения общими файлами (§1.6 п. 2):
 * корневой модуль его только импортирует. Провайдеры ядра
 * (`AiAnalyticsParamsLoader`, `AiAnalyticsSnapshotStore`,
 * `RequesterAccessService`) берутся из `AiAnalyticsCoreModule` и здесь не
 * объявляются повторно — DI-спека сборки закрепляет отсутствие дублей.
 * Битрикс срезу не нужен: только настройки портала и `ais`.
 * `PortalSessionModule` — для guard'а сессии портала на ручке чтения.
 */
@Module({
    imports: [AiAnalyticsCoreModule, PortalSessionModule],
    controllers: [AiAnalyticsAboutController],
    providers: [AiAnalyticsAboutUseCase],
    exports: [AiAnalyticsAboutUseCase],
})
export class AiAnalyticsAboutModule {}
