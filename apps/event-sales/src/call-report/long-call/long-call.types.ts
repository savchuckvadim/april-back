import type {
    LongCallDirection,
    LongCallEventKind,
    LongCallThreadStatus,
} from './long-call.const';

/** Строка расшифровки и её секунды по метке `[мм:сс]` (null — метки нет). */
export interface TranscriptLine {
    text: string;
    sec: number | null;
}

/** Часть длинной расшифровки. */
export interface TranscriptPart {
    /** Порядковый номер части, с 1. */
    number: number;
    /** Сколько частей всего. */
    total: number;
    text: string;
    /** Секунды первой метки `[мм:сс]` в части; меток нет — null. */
    fromSec: number | null;
    /** Секунды последней метки в части; меток нет — null. */
    toSec: number | null;
}

/** Событие конспекта части. */
export interface PartDigestEvent {
    kind: LongCallEventKind;
    /** Секунда начала по метке строки; времени нет — null. */
    startSec: number | null;
    /** Дословная цитата. */
    quote: string;
    /** Что произошло и чем ответила другая сторона. */
    note: string;
}

/** Конспект одной части. */
export interface PartDigest {
    summary: string;
    events: PartDigestEvent[];
    managerQuestions: number;
    endsWith: string;
}

/** Часть и её конспект; конспекта может не быть (запрос не удался). */
export interface DigestedPart {
    part: TranscriptPart;
    digest: PartDigest | null;
}

/** Событие всего разговора: событие конспекта и номер его части. */
export interface FlatDigestEvent extends PartDigestEvent {
    partNumber: number;
}

/** Сквозная линия сводки. */
export interface SummaryThread {
    kind: LongCallEventKind;
    topic: string;
    status: LongCallThreadStatus;
    /** Секунды, где линия звучала, по возрастанию, без повторов. */
    moments: number[];
    note: string;
}

/** Отрезок, который аналитику надо прочитать дословно. */
export interface SummaryWindow {
    fromSec: number;
    toSec: number;
    why: string;
}

/** Отрезки сводки по направлениям. */
export type SummaryWindows = Record<LongCallDirection, SummaryWindow[]>;

/** Сводка всего разговора. */
export interface ConversationSummary {
    story: string;
    threads: SummaryThread[];
    result: string;
    endedAbruptly: boolean;
    windows: SummaryWindows;
}
