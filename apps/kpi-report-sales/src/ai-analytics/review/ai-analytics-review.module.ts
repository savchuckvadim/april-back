import { Module } from '@nestjs/common';
import { AiModule } from '@lib/call-lib';
import { PbxAicallSmartModule } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { AiAnalyticsReviewController } from './ai-analytics-review.controller';
import { AiAnalyticsReviewUseCase } from './ai-analytics-review.use-case';
import { AiReviewRateLimiter } from './review-rate-limit';

/**
 * Срез «отзыв руководителя с сайта»: ручка `POST ai-analytics/review`.
 *
 * Стор обратной связи — из ядра (`AiAnalyticsCoreModule`), смарт портала —
 * `PbxAicallSmartModule` (entityTypeId «AI-анализ звонков»), записи
 * разбора — `AiModule`; чат админов — глобальный `TelegramService`
 * (TelegramModule подключён корнем приложения). Собственный @Module по
 * правилу владения общими файлами (§1.6 п. 2): корневой модуль его только
 * импортирует.
 */
@Module({
    imports: [AiModule, PbxAicallSmartModule, AiAnalyticsCoreModule],
    controllers: [AiAnalyticsReviewController],
    providers: [AiAnalyticsReviewUseCase, AiReviewRateLimiter],
    exports: [AiAnalyticsReviewUseCase],
})
export class AiAnalyticsReviewModule {}
