import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { QueueModule } from '@lib/queue/queue.module';
import { TranscriptionController } from './transcription.controller';
import { StartTranscriptionUseCase } from './use-cases/start-transcription.use-case';
import { StreamingTranscriptionService } from './services/streaming-transcription.service';
import { GetTranscriptionResultUseCase } from './use-cases/get-transcription-result.use-case';
import { TranscribeAudioProcessor } from './queue/transcribe-audio.processor';
import { StorageModule } from '@lib/core/storage/storage.module';
import { YandexModule } from '@lib/call-lib/yandex/yandex.module';
import { TranscriptionService } from './services/transcription.service';
import { FileStorageService } from './services/file-storage.service';
import { OnlineClientModule } from '@lib/online';
import { TranscriptionStoreModule } from './transcription-store.module';
import { TranscriptionStoreController } from './controllers/transcription-store.controller';

@Module({
    imports: [
        ConfigModule,
        PrismaModule,
        RedisModule,
        QueueModule,
        StorageModule,
        YandexModule,
        OnlineClientModule,
        // Репозиторий + TranscriptionStoreService (CRUD по транскрибациям).
        TranscriptionStoreModule,
    ],
    controllers: [TranscriptionController, TranscriptionStoreController],
    providers: [
        StartTranscriptionUseCase,
        GetTranscriptionResultUseCase,
        StreamingTranscriptionService,
        TranscribeAudioProcessor,
        FileStorageService,
        TranscriptionService,
    ],
    // Ре-экспорт store-модуля: потребители (call-analysis, event-sales)
    // продолжают получать TranscriptionStoreService через TranscriptionModule.
    exports: [TranscriptionStoreModule],
})
export class TranscriptionModule {}
