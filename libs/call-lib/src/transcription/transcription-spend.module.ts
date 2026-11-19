import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { TranscriptionSpendRepository } from './repository/transcription-spend.repository';
import { TranscriptionSpendService } from './services/transcription-spend.service';
import { YandexSttPriceService } from './services/yandex-stt-price.service';
import { YandexSubmissionModule } from './provider/yandex-submission.module';

/**
 * Расход на распознавание звонков — только сервисы, без контроллеров
 * (правило app-api-surface): чтение `transcriptions`, цена минуты Яндекса из
 * «Настроек приложения», месячный лимит портала из настроек AI и счётчик
 * отправок в Яндекс (Redis, YandexSubmissionModule). Подключают админка
 * (страницы расхода — через TranscriptionAdminModule) и event-sales
 * (оповещение о лимите).
 */
@Module({
    imports: [
        ConfigModule,
        PrismaModule,
        PortalStoreModule,
        YandexSubmissionModule,
    ],
    providers: [
        TranscriptionSpendRepository,
        YandexSttPriceService,
        TranscriptionSpendService,
    ],
    exports: [TranscriptionSpendService],
})
export class TranscriptionSpendModule {}
