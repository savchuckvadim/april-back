import { Module } from '@nestjs/common';
import { TranscriptionStoreModule } from './transcription-store.module';
import { AdminTranscriptionStoreController } from './controllers/transcription-store.admin.controller';
import { AdminTranscriptionSpendController } from './controllers/transcription-spend.admin.controller';
import { TranscriptionAdminPageService } from './services/transcription-admin-page.service';
import { TranscriptionSpendService } from './services/transcription-spend.service';
import { TranscriptionSpendRepository } from './repository/transcription-spend.repository';

/**
 * Админ-слой доставки для хранилища транскрибаций (`admin/transcription-store`)
 * и расхода на распознавание (`admin/transcription-spend`).
 * Импортирует лёгкий {@link TranscriptionStoreModule} ради
 * `TranscriptionStoreService` (репозиторий + Prisma) и регистрирует только
 * админ-контроллеры — без Redis/очереди/Yandex и её воркера. Подключать в
 * приложении админки, а НЕ в event-sales. Список и расход — только чтение
 * (PrismaModule подключён в TranscriptionStoreModule; цену минуты Яндекса
 * даёт глобальный VendorSettingsModule админки).
 */
@Module({
    imports: [TranscriptionStoreModule],
    controllers: [
        AdminTranscriptionStoreController,
        AdminTranscriptionSpendController,
    ],
    providers: [
        TranscriptionAdminPageService,
        TranscriptionSpendRepository,
        TranscriptionSpendService,
    ],
})
export class TranscriptionAdminModule {}
