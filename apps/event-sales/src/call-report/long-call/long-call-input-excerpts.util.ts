import { EVENT_WINDOW_RADIUS_SEC_STEPS } from './long-call.const';
import {
    fitCandidates,
    lineSet,
    type FitResult,
} from './long-call-input-budget.util';
import { headRange, lineSize, tailRange } from './long-call-input-lines.util';
import {
    mergeCandidates,
    trimCandidate,
    uniqueCandidates,
} from './long-call-input-merge.util';
import {
    eventWindowCandidates,
    summaryWindowCandidates,
} from './long-call-input-windows.util';
import type {
    ExcerptCandidate,
    ExcerptSelectionInput,
    LineRange,
    SelectedExcerpts,
} from './long-call-input.types';

/**
 * Отбор дословных отрывков одному потребителю: начало и конец записи, части
 * без конспекта, отрезки сводки и окна вокруг событий конспекта в пределах
 * бюджета. Приоритет у отрезков сводки; окна событий при нехватке места
 * сужаются по ступеням радиуса, затем отбрасываются.
 *
 * Чистая функция: без DI, Bitrix и Prisma.
 */

const LAST_STEP = EVENT_WINDOW_RADIUS_SEC_STEPS.length - 1;

/** Кандидаты без строк «начала» и «конца», без повторов. */
function prepare(
    candidates: readonly ExcerptCandidate[],
    head: LineRange | null,
    tail: LineRange | null,
): ExcerptCandidate[] {
    const trimmed = candidates.flatMap(candidate => {
        const result = trimCandidate(candidate, head, tail);

        return result === null ? [] : [result];
    });

    return uniqueCandidates(trimmed);
}

/** Окна событий: ступени радиуса от широкой к узкой, пока не уложатся целиком. */
function fitEventWindows(
    input: ExcerptSelectionInput,
    head: LineRange | null,
    tail: LineRange | null,
    windows: FitResult,
): FitResult {
    const { transcript, consumer } = input;
    const attempt = (step: number): FitResult => {
        const candidates = prepare(
            eventWindowCandidates(
                transcript,
                input.events,
                consumer.eventKinds,
                step,
                input.partRanges,
            ),
            head,
            tail,
        );
        const result = fitCandidates({
            candidates,
            covered: windows.covered,
            usedChars: windows.usedChars,
            budgetChars: consumer.budgetChars,
            keep: consumer.keep ?? 'earliest',
            sizeOf: index => lineSize(transcript, index),
        });

        return result.dropped.length === 0 || step >= LAST_STEP
            ? result
            : attempt(step + 1);
    };

    return attempt(0);
}

/**
 * Что дать потребителю дословно. Нулевой бюджет (синтез) — ни окон, ни
 * частей без конспекта; начало и конец берутся по их длине.
 */
export function selectExcerpts(input: ExcerptSelectionInput): SelectedExcerpts {
    const { transcript, consumer } = input;
    const head = headRange(transcript, consumer.headChars);
    const tail = tailRange(transcript, consumer.tailChars, head);
    if (consumer.budgetChars <= 0) {
        return { head, tail, groups: [], dropped: 0 };
    }
    const parts = prepare(input.partCandidates, head, tail);
    const windows = fitCandidates({
        candidates: prepare(
            summaryWindowCandidates(
                transcript,
                input.summary,
                consumer.directions,
            ),
            head,
            tail,
        ),
        covered: lineSet(parts.map(part => part.range)),
        usedChars: 0,
        budgetChars: consumer.budgetChars,
        keep: consumer.keep ?? 'earliest',
        sizeOf: index => lineSize(transcript, index),
    });
    const events = fitEventWindows(input, head, tail, windows);

    return {
        head,
        tail,
        groups: mergeCandidates([...parts, ...windows.kept, ...events.kept]),
        dropped: windows.dropped.length + events.dropped.length,
    };
}
