import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { YandexModule } from '@lib/call-lib/yandex/yandex.module';
import { StreamingTranscriptionService } from '../services/streaming-transcription.service';
import { VibeCodeClient } from '../../call-analysis/clients/vibecode.client';
import { VibeKeyResolverService } from '../../call-analysis/services/vibe-key-resolver.service';
import { TranscriptionRouterService } from './transcription-router.service';

/**
 * Модуль маршрутизатора транскрибации для автоконвейера call-report:
 * выбирает Yandex SpeechKit или Vibecode Whisper по длительности звонка.
 * Держит собственные инстансы клиентов — не зависит от CallAnalysisModule.
 *
 * PortalStoreModule нужен резолверу VibeCode-ключа: целевой источник
 * ключа — пер-портальный vibeKey из БД (env BITRIX_VIBE_TEST — fallback).
 */
@Module({
    imports: [ConfigModule, YandexModule, PortalStoreModule],
    providers: [
        StreamingTranscriptionService,
        VibeCodeClient,
        VibeKeyResolverService,
        TranscriptionRouterService,
    ],
    exports: [
        TranscriptionRouterService,
        VibeCodeClient,
        VibeKeyResolverService,
    ],
})
export class TranscriptionProviderModule {}
