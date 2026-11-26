import type {
    LongCallConsumer,
    LongCallConsumerInput,
} from './long-call-consumers.const';
import type {
    ConversationSummary,
    FlatDigestEvent,
    TranscriptLine,
} from './long-call.types';

/**
 * Типы сборки входа проходов длинного разговора: расшифровка по строкам,
 * отрывки-кандидаты, слитые отрывки и результат для сервиса.
 */

/** Расшифровка, разобранная на строки для выбора отрывков. */
export interface PreparedTranscript {
    /** Строки исходника по порядку (как у резки: длинная строка — по предложениям). */
    lines: readonly TranscriptLine[];
    /** Строки без учёта регистра и повторных пробелов — для поиска цитат. */
    normalized: readonly string[];
    /**
     * Когда звучала строка: её метка или метка ближайшей предыдущей строки с
     * меткой; до первой метки и у записи без меток — null.
     */
    secs: readonly (number | null)[];
    /** Секунда последней метки; меток нет — null. */
    lastSec: number | null;
}

/** Диапазон строк, границы включены. */
export interface LineRange {
    from: number;
    to: number;
}

/** Границы по времени, секунды. */
export interface TimeSpan {
    fromSec: number;
    toSec: number;
}

/** Откуда взялся отрывок: отрезок сводки, событие конспекта, часть без конспекта. */
export type ExcerptSource = 'window' | 'event' | 'part';

/** Отрывок-кандидат до слияния. */
export interface ExcerptCandidate {
    source: ExcerptSource;
    range: LineRange;
    /** Причина в заголовке слитого отрывка: why отрезка, вид события, «часть N…». */
    reason: string;
    /** Заголовок отрывка, который ни с кем не слит. */
    heading: string;
    /** Время, к которому привязан отрывок; null — времени нет. */
    span: TimeSpan | null;
}

/** Готовый отрывок: диапазон строк и заголовок (после слияния). */
export interface ExcerptGroup {
    range: LineRange;
    heading: string;
}

/** Что отобрано потребителю: начало, конец, отрывки и сколько не поместилось. */
export interface SelectedExcerpts {
    head: LineRange | null;
    tail: LineRange | null;
    groups: ExcerptGroup[];
    /** Сколько отрезков сводки и окон событий не вошло в бюджет. */
    dropped: number;
}

/** Вход отбора отрывков для одного потребителя. */
export interface ExcerptSelectionInput {
    transcript: PreparedTranscript;
    consumer: LongCallConsumerInput;
    summary: ConversationSummary | null;
    events: readonly FlatDigestEvent[];
    /** Части без конспекта: их текст входит в отрывки целиком. */
    partCandidates: readonly ExcerptCandidate[];
    /** Диапазон строк каждой части по её номеру. */
    partRanges: ReadonlyMap<number, LineRange>;
}

/** Строка журнала по одному потребителю. */
export interface LongCallConsumerReport {
    /** Длина собранного текста, знаков. */
    textChars: number;
    /** Сколько отрезков сводки и окон событий не вошло в бюджет. */
    droppedExcerpts: number;
}

/** Сводка сборки для журнала. */
export interface LongCallInputReport {
    partsCount: number;
    partsWithoutDigest: number;
    /** События конспектов без повторов из перекрытий. */
    eventsCount: number;
    /** Сквозных линий в сводке. */
    threadsCount: number;
    hasSummary: boolean;
    consumers: Record<LongCallConsumer, LongCallConsumerReport>;
}

/** Результат сборки: текст каждому потребителю и сводка для журнала. */
export interface LongCallInputs {
    texts: Record<LongCallConsumer, string>;
    report: LongCallInputReport;
}
