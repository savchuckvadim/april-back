import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EgressProxyModule } from '@lib/egress-proxy';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { VibecodeModule } from '@lib/vibecode';
import { YandexModule } from '@lib/call-lib/yandex/yandex.module';
import { StreamingTranscriptionService } from '../services/streaming-transcription.service';
import { WhisperCompatibleTranscriptionService } from '../services/whisper-compatible-transcription.service';
import { TranscriptionRouterService } from './transcription-router.service';

/**
 * Модуль маршрутизатора транскрибации для автоконвейера call-report:
 * выбирает Yandex SpeechKit или Vibecode Whisper по длительности звонка.
 *
 * VibeCode-часть (клиент + резолвер пер-портального ключа) — из
 * библиотеки @lib/vibecode; модуль её ре-экспортирует, чтобы потребители
 * (pipeline call-report) получали VibeCodeClient/VibeKeyResolverService
 * одним импортом.
 */
@Module({
    // PortalStoreModule — настройки AI портала (режим транскрибации, свой Whisper);
    // EgressProxyModule — зарубежный Whisper-сервис через исходящий прокси
    imports: [
        ConfigModule,
        YandexModule,
        VibecodeModule,
        PortalStoreModule,
        EgressProxyModule,
    ],
    providers: [
        StreamingTranscriptionService,
        // Свой Whisper — третий транскрибатор; без TRANSCRIPTION_WHISPER_BASE_URL
        // просто не участвует в маршрутизации
        WhisperCompatibleTranscriptionService,
        TranscriptionRouterService,
    ],
    exports: [TranscriptionRouterService, VibecodeModule],
})
export class TranscriptionProviderModule {}
