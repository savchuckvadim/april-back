import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { PortalSessionModule } from '@lib/auth';
import { CallPageLinkModule, TranscriptionStoreModule } from '@lib/call-lib';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { CallPageLinksController } from './call-page-links.controller';
import { CallPageLinksUseCase } from './call-page-links.use-case';
import { PbxAicallSmartModule } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { CallPageAudioService } from './call-page-audio.service';
import { CallPageCallResolver } from './call-page-call.resolver';
import { CallPageManagerNameService } from './call-page-manager-name.service';
import { CallPageController } from './call-page.controller';
import { CallPageUseCase } from './call-page.use-case';

/**
 * Срез «страница разбора звонка»: ручки `GET ai-analytics/call-page/:token`
 * (карточка) и `.../audio` (запись). Поверхность API приложения растёт ровно
 * на эти два открытых роута (ai/rules/app-api-surface.md).
 *
 * Проверка ссылки — `CallPageLinkModule` (общий с event-sales, который
 * ссылки выпускает), строка расшифровки — `TranscriptionStoreModule` (только
 * сервисы), портал для имени менеджера и записи — `PBXModule`, карточка
 * разбора в Битриксе — `PbxAicallSmartModule`. Собственный @Module по
 * правилу владения общими файлами: корневой модуль его только импортирует.
 */
@Module({
    imports: [
        PBXModule,
        // Периметр видимости менеджеров и сессия портала — для выдачи
        // ссылок спискам «Отчёта»
        AiAnalyticsCoreModule,
        PortalSessionModule,
        CallPageLinkModule,
        TranscriptionStoreModule,
        PbxAicallSmartModule,
    ],
    controllers: [CallPageController, CallPageLinksController],
    providers: [
        CallPageCallResolver,
        CallPageManagerNameService,
        CallPageAudioService,
        CallPageUseCase,
        CallPageLinksUseCase,
    ],
})
export class AiAnalyticsCallPageModule {}
