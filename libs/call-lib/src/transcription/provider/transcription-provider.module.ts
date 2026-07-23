import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VibecodeModule } from '@lib/vibecode';
import { YandexModule } from '@lib/call-lib/yandex/yandex.module';
import { StreamingTranscriptionService } from '../services/streaming-transcription.service';
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
    imports: [ConfigModule, YandexModule, VibecodeModule],
    providers: [StreamingTranscriptionService, TranscriptionRouterService],
    exports: [TranscriptionRouterService, VibecodeModule],
})
export class TranscriptionProviderModule {}
