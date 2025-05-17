import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from 'src/core/redis/redis.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { TranscriptionController } from './transcription.controller';
import { StartTranscriptionUseCase } from './use-cases/start-transcription.use-case';
import { StreamingTranscriptionService } from './services/streaming-transcription.service';
import { AuthService } from './services/auth.service';
import { FileStorageService } from './services/file-storage.service';
import { GetTranscriptionResultUseCase } from './use-cases/get-transcription-result.use-case';
import { TranscribeAudioProcessor } from './queue/transcribe-audio.processor';
import { StorageModule } from 'src/core/storage/storage.module';
import { YandexModule } from 'src/core/yandex/yandex.module';
import { FileStorageCopyService } from './services/file-storage-copy.service';
import { TranscriptionService } from './services/transcription.service';

@Module({
    imports: [
        ConfigModule,
        RedisModule,
        QueueModule,
        StorageModule,
        YandexModule,
    ],
    controllers: [TranscriptionController],
    providers: [
        StartTranscriptionUseCase,
        GetTranscriptionResultUseCase,
        StreamingTranscriptionService,
        AuthService,
        FileStorageService,
        TranscribeAudioProcessor,
        FileStorageCopyService,
        TranscriptionService,
    ],
})
export class TranscriptionModule { } 