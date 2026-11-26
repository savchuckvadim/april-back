import {
    EVENT_WINDOW_RADIUS_CHARS_STEPS,
    EVENT_WINDOW_RADIUS_SEC_STEPS,
    LONG_CALL_EVENT_KIND_LABELS,
    type LongCallDirection,
    type LongCallEventKind,
} from './long-call.const';
import { eventHeading, windowHeading } from './long-call-input-heading.util';
import {
    linesAroundQuote,
    linesInTimeRange,
} from './long-call-input-lines.util';
import type {
    ExcerptCandidate,
    LineRange,
    PreparedTranscript,
} from './long-call-input.types';
import type { ConversationSummary, FlatDigestEvent } from './long-call.types';

/**
 * Отрывки-кандидаты: отрезки сводки (их назвала модель по каждому
 * направлению) и окна вокруг событий конспекта (правила кода).
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */

/** Радиус на ступени сужения; ступеней меньше — берём последнюю. */
const radiusAt = (steps: readonly number[], step: number): number =>
    steps[Math.min(step, steps.length - 1)];

/**
 * Отрезки сводки по направлениям потребителя: строки, чьё время попадает в
 * отрезок. Записи без меток и отрезки без строк кандидатов не дают.
 */
export function summaryWindowCandidates(
    transcript: PreparedTranscript,
    summary: ConversationSummary | null,
    directions: readonly LongCallDirection[],
): ExcerptCandidate[] {
    if (summary === null) return [];

    return directions.flatMap(direction =>
        summary.windows[direction].flatMap(window => {
            const range = linesInTimeRange(
                transcript,
                window.fromSec,
                window.toSec,
            );
            if (range === null) return [];
            const span = { fromSec: window.fromSec, toSec: window.toSec };

            return [
                {
                    source: 'window' as const,
                    range,
                    reason: window.why,
                    heading: windowHeading(span, window.why),
                    span,
                },
            ];
        }),
    );
}

/**
 * Окно вокруг события на данной ступени сужения. Есть время — строки в
 * пределах радиуса в секундах; нет времени (или в окне нет строк) — строка с
 * цитатой и соседние в пределах радиуса в знаках; цитата не найдена — окна нет.
 */
function eventCandidate(
    transcript: PreparedTranscript,
    event: FlatDigestEvent,
    step: number,
    partRange: LineRange | null,
): ExcerptCandidate | null {
    const radiusSec = radiusAt(EVENT_WINDOW_RADIUS_SEC_STEPS, step);
    const byTime =
        event.startSec === null
            ? null
            : linesInTimeRange(
                  transcript,
                  event.startSec - radiusSec,
                  event.startSec + radiusSec,
              );
    const range =
        byTime ??
        linesAroundQuote(
            transcript,
            event.quote,
            radiusAt(EVENT_WINDOW_RADIUS_CHARS_STEPS, step),
            partRange,
        );
    if (range === null) return null;

    return {
        source: 'event',
        range,
        reason: LONG_CALL_EVENT_KIND_LABELS[event.kind],
        heading: eventHeading(event),
        span:
            event.startSec === null
                ? null
                : { fromSec: event.startSec, toSec: event.startSec },
    };
}

/** Окна вокруг событий нужных видов на ступени сужения step (0 — самые широкие). */
export function eventWindowCandidates(
    transcript: PreparedTranscript,
    events: readonly FlatDigestEvent[],
    kinds: readonly LongCallEventKind[],
    step: number,
    partRanges: ReadonlyMap<number, LineRange>,
): ExcerptCandidate[] {
    return events
        .filter(event => kinds.includes(event.kind))
        .flatMap(event => {
            const candidate = eventCandidate(
                transcript,
                event,
                step,
                partRanges.get(event.partNumber) ?? null,
            );

            return candidate === null ? [] : [candidate];
        });
}
