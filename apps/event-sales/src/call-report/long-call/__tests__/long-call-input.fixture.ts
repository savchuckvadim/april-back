import { formatTimecode } from '@lib/call-lib';
import { LONG_CALL_DIRECTIONS } from '../long-call.const';
import type {
    ConversationSummary,
    DigestedPart,
    FlatDigestEvent,
    PartDigest,
    PartDigestEvent,
    SummaryWindows,
} from '../long-call.types';
import { splitTranscript, type SplitOptions } from '../long-call-split.util';

/**
 * Данные для тестов сборки входа проходов длинного разговора: строки
 * фиксированной длины (так бюджет считается в уме), части с конспектами,
 * сводки и разбор готового текста потребителя на отрывки.
 */

/** Длина строки в тестах; в бюджете строка занимает на знак больше (перевод строки). */
export const FIXED_LINE_CHARS = 100;
/** Знаков, которые строка занимает в бюджете. */
export const FIXED_LINE_SIZE = FIXED_LINE_CHARS + 1;
/** Шаг меток времени в равномерной расшифровке, секунд. */
export const FIXED_STEP_SEC = 10;

/** Строка ровно chars знаков: «[мм:сс] Клиент: метка ххх…». */
export function timedLine(
    sec: number,
    label: string,
    chars = FIXED_LINE_CHARS,
): string {
    return `[${formatTimecode(sec)}] Клиент: ${label} `.padEnd(chars, 'х');
}

/** count строк подряд: i-я звучит на секунде i * stepSec, метка «р{i}». */
export function uniformLines(
    count: number,
    stepSec = FIXED_STEP_SEC,
): string[] {
    return Array.from({ length: count }, (_, index) =>
        timedLine(index * stepSec, `р${index}`),
    );
}

/** Режем так же, как сервис: размер части и перекрытие задаёт тест. */
export const SMALL_SPLIT: SplitOptions = {
    partChars: 3_000,
    overlapChars: 300,
};

/** Части расшифровки; конспект части — digests[i] (нет — null). */
export function makeParts(
    text: string,
    digests: readonly (PartDigest | null)[] = [],
    options: SplitOptions = SMALL_SPLIT,
): DigestedPart[] {
    return splitTranscript(text, options).map((part, index) => ({
        part,
        digest: digests[index] ?? null,
    }));
}

export const digestOf = (overrides: Partial<PartDigest> = {}): PartDigest => ({
    summary: 'Говорили о задаче.',
    events: [],
    managerQuestions: 0,
    endsWith: 'разговор продолжается',
    ...overrides,
});

export const eventOf = (
    overrides: Partial<PartDigestEvent> = {},
): PartDigestEvent => ({
    kind: 'need',
    startSec: null,
    quote: 'цитата',
    note: '',
    ...overrides,
});

/** Событие целого разговора (для окон): событие конспекта и номер части. */
export const flatEventOf = (
    overrides: Partial<FlatDigestEvent> = {},
): FlatDigestEvent => ({ ...eventOf(), partNumber: 1, ...overrides });

/** Индекс первой части, чьё время накрывает секунду; нет такой — -1. */
const partIndexAt = (parts: readonly DigestedPart[], sec: number): number =>
    parts.findIndex(
        ({ part }) =>
            part.fromSec !== null &&
            part.toSec !== null &&
            sec >= part.fromSec &&
            sec <= part.toSec,
    );

/** Каждое событие — в конспект первой части, чьё время его накрывает. */
export function digestEventsIntoParts(
    parts: readonly DigestedPart[],
    events: readonly PartDigestEvent[],
): DigestedPart[] {
    return parts.map(({ part }, index) => ({
        part,
        digest: digestOf({
            summary: `Конспект части ${index + 1}.`,
            events: events.filter(
                event =>
                    event.startSec !== null &&
                    partIndexAt(parts, event.startSec) === index,
            ),
        }),
    }));
}

export const emptyWindows = (): SummaryWindows => {
    const windows = {} as SummaryWindows;
    for (const direction of LONG_CALL_DIRECTIONS) windows[direction] = [];

    return windows;
};

export const summaryOf = (
    overrides: Partial<ConversationSummary> = {},
): ConversationSummary => ({
    story: 'Менеджер выяснил задачу и показал систему.',
    threads: [],
    result: 'Договорились о показе.',
    endedAbruptly: false,
    windows: emptyWindows(),
    ...overrides,
});

/** Отрывки из готового текста потребителя. */
export interface ParsedSection {
    heading: string;
    lines: string[];
}

export interface ParsedExcerpts {
    sections: ParsedSection[];
    /** Число из строки «Не вошло отрывков: N.»; строки нет — null. */
    dropped: number | null;
}

const EXCERPTS_TITLE = 'ДОСЛОВНЫЕ ОТРЫВКИ';
const HEADING = /^— (.*) —$/;
const DROPPED = /^Не вошло отрывков: (\d+)\.$/;

/** Блок «ДОСЛОВНЫЕ ОТРЫВКИ» текста: подзаголовки и строки под ними; блока нет — null. */
export function parseExcerpts(text: string): ParsedExcerpts | null {
    const block = text
        .split('\n\n')
        .find(candidate => candidate.startsWith(EXCERPTS_TITLE));
    if (block === undefined) return null;
    const result: ParsedExcerpts = { sections: [], dropped: null };
    for (const line of block.split('\n').slice(1)) {
        const heading = HEADING.exec(line);
        const dropped = DROPPED.exec(line);
        if (heading) {
            result.sections.push({ heading: heading[1], lines: [] });
        } else if (dropped) {
            result.dropped = Number(dropped[1]);
        } else {
            result.sections[result.sections.length - 1].lines.push(line);
        }
    }

    return result;
}

/** Все строки расшифровки в отрывках текста, по порядку печати. */
export const excerptLines = (text: string): string[] =>
    (parseExcerpts(text)?.sections ?? []).flatMap(section => section.lines);

/** Подзаголовки отрывков текста по порядку. */
export const excerptHeadings = (text: string): string[] =>
    (parseExcerpts(text)?.sections ?? []).map(section => section.heading);
