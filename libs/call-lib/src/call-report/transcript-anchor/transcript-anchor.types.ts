/**
 * Привязка места разбора к расшифровке (цитата и время в звонке): общие типы
 * страницы звонка (kpi-report-sales) и приёма разбора (event-sales).
 */

/** Реплика расшифровки: номер, время и текст. */
export interface AnchorSegment {
    index: number;
    /** Секунды от начала записи; null — у расшифровки нет таймкодов. */
    startSec: number | null;
    endSec: number | null;
    text: string;
}

/** Место разбора: цитата и (если есть) время. */
export interface TranscriptAnchor {
    quote: string | null;
    startSec: number | null;
    endSec: number | null;
}

export interface TranscriptAnchorMatch {
    /** Номера реплик по возрастанию; пусто — место в расшифровке не найдено. */
    segmentIndexes: number[];
    /** Куда поставить запись; null — времени нет. */
    startSec: number | null;
}

/** Слова расшифровки подряд и номер реплики каждого слова. */
export interface TranscriptAnchorIndex {
    segments: readonly AnchorSegment[];
    words: string[];
    /** Позиция реплики (в `segments`) для каждого слова. */
    owners: number[];
}
