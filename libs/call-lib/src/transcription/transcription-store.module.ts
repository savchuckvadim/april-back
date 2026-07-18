import { Module } from '@nestjs/common';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { TranscriptionRepository } from './repository/transcription.repository';
import { TranscriptionPrismaRepository } from './repository/transcription.prisma.repository';
import { TranscriptionStoreService } from './services/transcription.store.service';

/**
 * Лёгкий модуль хранилища транскрибаций: репозиторий (Prisma) + store-сервис.
 * Без Redis/очереди/Yandex/Storage — чтобы потребители, которым нужен только
 * CRUD по транскрибациям (админка, admin-контроллер), не тянули тяжёлую
 * инфраструктуру транскрибации и её очередной воркер.
 *
 * Целевой (`transcription-store`) и админский (`admin/transcription-store`)
 * контроллеры регистрируются в потребляющих модулях
 * ({@link TranscriptionModule} / TranscriptionAdminModule), а не здесь.
 */
@Module({
    imports: [PrismaModule],
    providers: [
        {
            provide: TranscriptionRepository,
            useClass: TranscriptionPrismaRepository,
        },
        TranscriptionStoreService,
    ],
    exports: [TranscriptionStoreService],
})
export class TranscriptionStoreModule {}
