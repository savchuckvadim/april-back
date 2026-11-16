import { Module } from '@nestjs/common';
import { TranscriptionStoreModule } from './transcription-store.module';
import { TranscriptionSpendModule } from './transcription-spend.module';
import { AdminTranscriptionStoreController } from './controllers/transcription-store.admin.controller';
import { AdminTranscriptionSpendController } from './controllers/transcription-spend.admin.controller';
import { TranscriptionAdminPageService } from './services/transcription-admin-page.service';

/**
 * Админ-слой доставки для хранилища транскрибаций (`admin/transcription-store`)
 * и расхода на распознавание (`admin/transcription-spend`).
 * Импортирует лёгкий {@link TranscriptionStoreModule} ради
 * `TranscriptionStoreService` (репозиторий + Prisma) и
 * {@link TranscriptionSpendModule} ради расчёта расхода; регистрирует только
 * админ-контроллеры — без Redis/очереди/Yandex и её воркера. Подключать в
 * приложении админки, а НЕ в event-sales. Список и расход — только чтение.
 */
@Module({
    imports: [TranscriptionStoreModule, TranscriptionSpendModule],
    controllers: [
        AdminTranscriptionStoreController,
        AdminTranscriptionSpendController,
    ],
    providers: [TranscriptionAdminPageService],
})
export class TranscriptionAdminModule {}
