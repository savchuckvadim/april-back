import type { LongCallKeep } from './long-call-consumers.const';
import { byPosition } from './long-call-input-merge.util';
import type { ExcerptCandidate, LineRange } from './long-call-input.types';

/**
 * Укладка отрывков в бюджет. Кандидаты берутся по порядку приоритета (ранние
 * или поздние по месту в записи), пока помещаются; на первом, который не
 * помещается, берём остановку — остальные не вошли. Строки, которые уже
 * есть в записи отрывков (части без конспекта, ранее взятые отрывки), места
 * не занимают и второй раз не считаются.
 *
 * Чистая функция: без DI, Bitrix и Prisma.
 */

export interface FitInput {
    candidates: readonly ExcerptCandidate[];
    /** Строки, уже вошедшие в отрывки: бесплатны и в бюджет не идут. */
    covered: ReadonlySet<number>;
    /** Сколько знаков бюджета уже занято. */
    usedChars: number;
    budgetChars: number;
    keep: LongCallKeep;
    /** Сколько знаков занимает строка. */
    sizeOf: (lineIndex: number) => number;
}

export interface FitResult {
    kept: ExcerptCandidate[];
    dropped: ExcerptCandidate[];
    /** Строки, вошедшие в отрывки после укладки (с уже бывшими). */
    covered: Set<number>;
    usedChars: number;
}

/** Знаков в новых строках диапазона (тех, что ещё не в отрывках). */
function newChars(
    range: LineRange,
    covered: ReadonlySet<number>,
    sizeOf: (lineIndex: number) => number,
): number {
    let chars = 0;
    for (let index = range.from; index <= range.to; index++) {
        if (!covered.has(index)) chars += sizeOf(index);
    }

    return chars;
}

/** Добавляет в множество индексы строк диапазона. */
function addRange(lines: Set<number>, range: LineRange): void {
    for (let index = range.from; index <= range.to; index++) lines.add(index);
}

/** Строки диапазонов как множество индексов. */
export function lineSet(ranges: readonly LineRange[]): Set<number> {
    const lines = new Set<number>();
    for (const range of ranges) addRange(lines, range);

    return lines;
}

/** Укладывает кандидатов в бюджет по правилу «ранние» или «поздние». */
export function fitCandidates(input: FitInput): FitResult {
    const ordered = [...input.candidates].sort(byPosition);
    if (input.keep === 'latest') ordered.reverse();
    const covered = new Set(input.covered);
    let usedChars = input.usedChars;
    let taken = 0;
    for (const candidate of ordered) {
        const chars = newChars(candidate.range, covered, input.sizeOf);
        if (usedChars + chars > input.budgetChars) break;
        usedChars += chars;
        addRange(covered, candidate.range);
        taken++;
    }

    return {
        kept: ordered.slice(0, taken),
        dropped: ordered.slice(taken),
        covered,
        usedChars,
    };
}
