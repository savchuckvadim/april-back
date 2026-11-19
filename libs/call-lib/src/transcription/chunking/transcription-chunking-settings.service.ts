import { Injectable, Logger } from '@nestjs/common';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
    toTranscriptionChunking,
    type TranscriptionChunkingSettings,
} from '@lib/portal-lib/store/app-settings';

/**
 * Нахлёст соседних кусков, секунд: фраза на стыке целиком попадает хотя бы
 * в один кусок, а повтор убирает склейка. Не настройка портала — от него
 * зависит только качество стыка, не деньги и не скорость.
 */
export const TRANSCRIPTION_CHUNK_OVERLAP_SEC = 10;

/** Что действует для портала вместе с нахлёстом — готово для transcribeChunked. */
export interface TranscriptionChunkingPlan
    extends TranscriptionChunkingSettings {
    overlapSec: number;
}

/**
 * Настройки резки длинных звонков портала (ключи `call_transcription_chunk*`
 * приложения event-sales, кэш настроек — 5 минут). Не прочитались —
 * резка выключена: звонок идёт прежним путём, а не падает.
 */
@Injectable()
export class TranscriptionChunkingSettingsService {
    private readonly logger = new Logger(
        TranscriptionChunkingSettingsService.name,
    );

    constructor(private readonly appSettings: PortalAppSettingsService) {}

    async resolve(domain: string): Promise<TranscriptionChunkingPlan> {
        try {
            const values = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.eventSales,
            );
            return this.plan(toTranscriptionChunking(values));
        } catch (error) {
            this.logger.warn(
                `Настройки резки звонков портала ${domain} не прочитаны (${(error as Error).message}) — резка выключена`,
            );
            return this.plan(toTranscriptionChunking(null));
        }
    }

    private plan(
        settings: TranscriptionChunkingSettings,
    ): TranscriptionChunkingPlan {
        return { ...settings, overlapSec: TRANSCRIPTION_CHUNK_OVERLAP_SEC };
    }
}
