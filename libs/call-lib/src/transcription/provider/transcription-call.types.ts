import type { TranscriptSegment } from '../types/transcript-segment.types';
import type { TranscriptionProvider } from './transcription-provider.types';

/**
 * Вход и итог распознавания одного звонка маршрутизатором — отдельно от
 * роутера: их же берут исполнитель резки длинных звонков и потребители
 * (конвейер call-report) — без цикла импортов.
 */
export interface TranscribeCallInput {
    buffer: Buffer;
    fileName: string;
    domain: string;
    /** Длительность звонка в секундах (из voximplant) — основа маршрутизации. */
    durationSec?: number;
    /**
     * Ключ звонка (dedupKey конвейера): по нему замок, лимит отправок и
     * сохранённый номер операции стража Яндекса, прогресс кусков длинного
     * звонка в Redis. Нет — по хэшу записи.
     */
    callKey?: string;
}

export interface TranscribeCallResult {
    text: string;
    provider: TranscriptionProvider;
    /** Сегменты с таймкодами (П6); null — провайдер их не дал. */
    segments: TranscriptSegment[] | null;
}
