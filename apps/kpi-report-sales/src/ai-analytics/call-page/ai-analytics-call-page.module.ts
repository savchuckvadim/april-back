import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { RedisModule } from '@/core/redis/redis.module';
import { PortalSessionModule } from '@lib/auth';
import {
    AiModule,
    CallPageLinkModule,
    TranscriptionStoreModule,
} from '@lib/call-lib';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { AiAnalyticsCallReviewStore } from '../store/ai-analytics-call-review.store';
import { CallPageLinksController } from './call-page-links.controller';
import { CallPageLinksUseCase } from './call-page-links.use-case';
import { PbxAicallSmartModule } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { CallPageAudioService } from './call-page-audio.service';
import { CallPageCallResolver } from './call-page-call.resolver';
import { CallPageLeadAccess } from './call-page-lead.access';
import { CallPageLeadController } from './call-page-lead.controller';
import { CallPageLeadUseCase } from './call-page-lead.use-case';
import { CallPageManagerNameService } from './call-page-manager-name.service';
import { CallPageController } from './call-page.controller';
import { CallPageUseCase } from './call-page.use-case';
import { CallReviewRateLimiter } from './call-review-rate-limit';

/**
 * Срез «страница разбора звонка»: ручки `GET ai-analytics/call-page/:token`
 * (карточка) и `.../audio` (запись), личная страница руководителя
 * `.../lead/:lead` (отзывы по звонку) и `.../lead/:lead/review` (свой
 * отзыв). Поверхность API приложения растёт ровно на эти открытые роуты и
 * на выдачу ссылок спискам (ai/rules/app-api-surface.md).
 *
 * Проверка ссылки и личного ключа — `CallPageLinkModule` (общий с
 * event-sales, который ссылки выпускает), строка расшифровки —
 * `TranscriptionStoreModule` (только сервисы), отзывы руководителей —
 * записи `ais` (`AiModule`), частота сохранений — Redis (`RedisModule`),
 * портал для имени менеджера и записи — `PBXModule`, карточка разбора в
 * Битриксе — `PbxAicallSmartModule`. Собственный @Module по правилу
 * владения общими файлами: корневой модуль его только импортирует.
 */
@Module({
    imports: [
        PBXModule,
        // Периметр видимости менеджеров, обратная связь, кэш и сессия
        // портала — для ссылок спискам «Отчёта» и права на отзыв.
        AiAnalyticsCoreModule,
        PortalSessionModule,
        CallPageLinkModule,
        TranscriptionStoreModule,
        PbxAicallSmartModule,
        AiModule,
        RedisModule,
    ],
    controllers: [
        CallPageController,
        CallPageLinksController,
        CallPageLeadController,
    ],
    providers: [
        CallPageCallResolver,
        CallPageManagerNameService,
        CallPageAudioService,
        CallPageUseCase,
        CallPageLinksUseCase,
        AiAnalyticsCallReviewStore,
        CallReviewRateLimiter,
        CallPageLeadAccess,
        CallPageLeadUseCase,
    ],
})
export class AiAnalyticsCallPageModule {}
