import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { YandexModule } from '@lib/call-lib/yandex/yandex.module';
import { StreamingTranscriptionService } from '../services/streaming-transcription.service';
import { VibeCodeClient } from '../../call-analysis/clients/vibecode.client';
import { TranscriptionRouterService } from './transcription-router.service';

/**
 * Модуль маршрутизатора транскрибации для автоконвейера call-report:
 * выбирает Yandex SpeechKit или Vibecode Whisper по длительности звонка.
 * Держит собственные инстансы клиентов — не зависит от CallAnalysisModule.
 */
@Module({
    imports: [ConfigModule, YandexModule],
    providers: [
        StreamingTranscriptionService,
        VibeCodeClient,
        TranscriptionRouterService,
    ],
    exports: [TranscriptionRouterService, VibeCodeClient],
})
export class TranscriptionProviderModule {}
