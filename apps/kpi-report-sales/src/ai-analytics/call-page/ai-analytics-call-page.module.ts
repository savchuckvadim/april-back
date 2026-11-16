import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { CallPageLinkModule, TranscriptionStoreModule } from '@lib/call-lib';
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
        CallPageLinkModule,
        TranscriptionStoreModule,
        PbxAicallSmartModule,
    ],
    controllers: [CallPageController],
    providers: [
        CallPageCallResolver,
        CallPageManagerNameService,
        CallPageAudioService,
        CallPageUseCase,
    ],
})
export class AiAnalyticsCallPageModule {}
