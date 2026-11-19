import { Module } from '@nestjs/common';
import { RedisModule } from '@/core/redis/redis.module';
import { AiModule, CallPageLinkModule } from '@lib/call-lib';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { CallReviewsDigestScheduler } from './call-reviews-digest.scheduler';
import { CallReviewsDigestUseCase } from './call-reviews-digest.use-case';

/**
 * Срез «сводка отзывов о разборах в Telegram» (этап 4 техрешения
 * 2026-11-19-call-reviews-design.md): крон 09:00 МСК, без контроллеров —
 * поверхность API приложения не растёт.
 *
 * Порталы — ядро (`AiAnalyticsCoreModule`), отзывы — записи `ais`
 * (`AiModule`), публичные ссылки на страницу разбора — `CallPageLinkModule`,
 * замок дня — Redis (`RedisModule`). `TelegramService` — из глобального
 * `TelegramModule` корня приложения; `ScheduleModule.forRoot()` поднят там
 * же.
 */
@Module({
    imports: [AiAnalyticsCoreModule, AiModule, CallPageLinkModule, RedisModule],
    providers: [CallReviewsDigestUseCase, CallReviewsDigestScheduler],
})
export class AiAnalyticsCallReviewsDigestModule {}
