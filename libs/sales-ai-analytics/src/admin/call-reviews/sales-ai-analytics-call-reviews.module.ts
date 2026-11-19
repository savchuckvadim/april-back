import { Module } from '@nestjs/common';
import { AiModule, CallPageLinkModule } from '@lib/call-lib';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { CallReviewsAdminService } from './call-reviews-admin.service';
import { CallReviewsCallsReader } from './call-reviews-calls.reader';

/**
 * Сервисы админ-списка «Отзывы о разборах» БЕЗ контроллеров
 * (ai/rules/app-api-surface.md): записи отзывов — `AiModule`, менеджер и
 * начало звонка — строки расшифровок (`PrismaModule`), публичные ссылки на
 * страницу разбора — `CallPageLinkModule`. Контроллер подключает
 * `SalesAiAnalyticsAdminModule` (только apps/admin).
 */
@Module({
    imports: [AiModule, CallPageLinkModule, PrismaModule],
    providers: [CallReviewsAdminService, CallReviewsCallsReader],
    exports: [CallReviewsAdminService],
})
export class SalesAiAnalyticsCallReviewsModule {}
