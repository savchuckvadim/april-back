import type {
    EnumPortalAppCode,
    PortalAppSettingsValues,
} from '../portal-app-settings.schema';

/**
 * Резка длинных звонков на куски (19.11.2026): длинный звонок режется на
 * куски по несколько минут, куски распознают бесплатные распознаватели
 * маршрута портала, Яндекс — только для куска, который не распознал никто.
 * Ключи `call_transcription_chunk*` (event-sales) — дефолты и границы здесь,
 * общие для реестра настроек и маршрутизатора распознавания.
 */
export const TRANSCRIPTION_CHUNKING_DEFAULTS = {
    /** Выключено: включается на портале осознанно. */
    enabled: false,
    chunkMinutes: 5,
    parallel: 3,
} as const;

/** Длина куска, минут: короче двух — слишком много стыков, длиннее десяти — не укладывается в срок ответа. */
export const TRANSCRIPTION_CHUNK_MINUTES_RANGE = { min: 2, max: 10 } as const;

/** Кусков одного звонка одновременно: больше шести бесплатный сервис отвечает «слишком много запросов». */
export const TRANSCRIPTION_CHUNK_PARALLEL_RANGE = { min: 1, max: 6 } as const;

/** Что действует для портала. */
export interface TranscriptionChunkingSettings {
    enabled: boolean;
    /** Длина куска, секунд. */
    chunkSec: number;
    /** Сколько кусков одного звонка распознаются одновременно. */
    parallel: number;
}

/** Ключи настроек event-sales, из которых читается резка. */
export type TranscriptionChunkingValues = Pick<
    PortalAppSettingsValues<EnumPortalAppCode.eventSales>,
    | 'callTranscriptionChunksEnabled'
    | 'callTranscriptionChunkMinutes'
    | 'callTranscriptionChunkParallel'
>;

interface Range {
    min: number;
    max: number;
}

/** Число в границах; не число — значение по умолчанию. */
const clamp = (value: unknown, range: Range, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value)
        ? Math.min(range.max, Math.max(range.min, value))
        : fallback;

/**
 * Настройки event-sales → резка: вне границ — ближайшая граница, мусор и
 * отсутствие настроек — значения по умолчанию (резка выключена).
 */
export function toTranscriptionChunking(
    values: Partial<TranscriptionChunkingValues> | null,
): TranscriptionChunkingSettings {
    const minutes = clamp(
        values?.callTranscriptionChunkMinutes,
        TRANSCRIPTION_CHUNK_MINUTES_RANGE,
        TRANSCRIPTION_CHUNKING_DEFAULTS.chunkMinutes,
    );
    return {
        enabled: values?.callTranscriptionChunksEnabled === true,
        chunkSec: Math.round(minutes * 60),
        parallel: Math.round(
            clamp(
                values?.callTranscriptionChunkParallel,
                TRANSCRIPTION_CHUNK_PARALLEL_RANGE,
                TRANSCRIPTION_CHUNKING_DEFAULTS.parallel,
            ),
        ),
    };
}
