import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from 'src/core/redis/redis.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { TranscriptionController } from './transcription.controller';
import { StartTranscriptionUseCase } from './use-cases/start-transcription.use-case';
import { StreamingTranscriptionService } from './services/streaming-transcription.service';
import { AuthService } from './services/auth.service';
import { GetTranscriptionResultUseCase } from './use-cases/get-transcription-result.use-case';
import { TranscribeAudioProcessor } from './queue/transcribe-audio.processor';
import { StorageModule } from 'src/core/storage/storage.module';
import { YandexModule } from 'src/clients/yandex/yandex.module';
import { TranscriptionService } from './services/transcription.service';
import { FileStorageService } from './services/file-storage.service';
import { OnlineClientModule } from 'src/clients/online';

@Module({
    imports: [
        ConfigModule,
        RedisModule,
        QueueModule,
        StorageModule,
        YandexModule,
        OnlineClientModule
    ],
    controllers: [TranscriptionController],
    providers: [
        StartTranscriptionUseCase,
        GetTranscriptionResultUseCase,
        StreamingTranscriptionService,
        AuthService,
        TranscribeAudioProcessor,
        FileStorageService,
        TranscriptionService,
    ],
})
export class TranscriptionModule { } 