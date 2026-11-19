import { Module } from '@nestjs/common';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { ChunkedTranscriptionService } from './chunked-transcription.service';
import { TranscriptionChunkingSettingsService } from './transcription-chunking-settings.service';

/**
 * Распознавание длинных звонков кусками: раздача кусков с прогрессом в
 * Redis и настройки резки портала. Без контроллеров — подключается в
 * модуль маршрутизатора распознавания.
 */
@Module({
    imports: [RedisModule, PortalAppSettingsModule],
    providers: [
        ChunkedTranscriptionService,
        TranscriptionChunkingSettingsService,
    ],
    exports: [
        ChunkedTranscriptionService,
        TranscriptionChunkingSettingsService,
    ],
})
export class ChunkedTranscriptionModule {}
