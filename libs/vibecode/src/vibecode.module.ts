import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { VibeCodeClient } from './vibecode.client';
import { VibeKeyResolverService } from './vibe-key-resolver.service';

/**
 * Точка доступа к VibeCode API (vibecode.bitrix24.tech) — переиспользуемая
 * библиотека @lib/vibecode: транскрибация Whisper, chat/completions со
 * strict JSON-схемой (анализ/классификация звонков) и резолюция
 * пер-портального ключа (Portal.keys.vibeKey из БД, кэш 60с).
 *
 * Подключение потребителем: imports: [VibecodeModule] — приезжают
 * VibeCodeClient и VibeKeyResolverService. Ключ VibeCode ТОЛЬКО из БД
 * портала (env-переменной нет); таймауты — env
 * VIBECODE_TRANSCRIBE_TIMEOUT_MS / VIBECODE_ANALYSIS_TIMEOUT_MS.
 *
 * Подробности — README.md библиотеки.
 */
@Module({
    imports: [ConfigModule, PortalStoreModule],
    providers: [VibeCodeClient, VibeKeyResolverService],
    exports: [VibeCodeClient, VibeKeyResolverService],
})
export class VibecodeModule {}
