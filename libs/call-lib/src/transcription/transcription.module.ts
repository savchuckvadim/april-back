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
import { TranscriptionRepository } from './repository/transcription.repository';
import { TranscriptionPrismaRepository } from './repository/transcription.prisma.repository';
import { TranscriptionStoreService } from './services/transcription.store.service';
import { TranscriptionStoreController } from './controllers/transcription-store.controller';
import { AdminTranscriptionStoreController } from './controllers/transcription-store.admin.controller';

@Module({
    imports: [
        ConfigModule,
        PrismaModule,
        RedisModule,
        QueueModule,
        StorageModule,
        YandexModule,
        OnlineClientModule,
    ],
    controllers: [
        TranscriptionController,
        TranscriptionStoreController,
        AdminTranscriptionStoreController,
    ],
    providers: [
        {
            provide: TranscriptionRepository,
            useClass: TranscriptionPrismaRepository,
        },
        TranscriptionStoreService,
        StartTranscriptionUseCase,
        GetTranscriptionResultUseCase,
        StreamingTranscriptionService,
        TranscribeAudioProcessor,
        FileStorageService,
        TranscriptionService,
    ],
    exports: [TranscriptionStoreService],
})
export class TranscriptionModule {}
