import { Module } from '@nestjs/common';
import { TranscriptionStoreModule } from './transcription-store.module';
import { AdminTranscriptionStoreController } from './controllers/transcription-store.admin.controller';

/**
 * Админ-слой доставки для хранилища транскрибаций (`admin/transcription-store`).
 * Импортирует лёгкий {@link TranscriptionStoreModule} ради
 * `TranscriptionStoreService` (репозиторий + Prisma) и регистрирует только
 * админ-контроллер — без Redis/очереди/Yandex и её воркера. Подключать в
 * приложении админки, а НЕ в event-sales.
 */
@Module({
    imports: [TranscriptionStoreModule],
    controllers: [AdminTranscriptionStoreController],
})
export class TranscriptionAdminModule {}
