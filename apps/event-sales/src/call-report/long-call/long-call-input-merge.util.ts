import { mergedHeading } from './long-call-input-heading.util';
import type {
    ExcerptCandidate,
    ExcerptGroup,
    LineRange,
} from './long-call-input.types';

/**
 * Подготовка кандидатов и слияние: отрывки не повторяют строки блоков
 * «начало» и «конец», одинаковые кандидаты схлопываются, пересекающиеся и
 * соприкасающиеся отрывки сливаются в один.
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */

/** Порядок по месту в записи: сначала раньше начинается, затем раньше кончается. */
export const byPosition = (
    left: { range: LineRange },
    right: { range: LineRange },
): number =>
    left.range.from - right.range.from || left.range.to - right.range.to;

/**
 * Кандидат без строк блоков «начало» и «конец»; целиком внутри них — null.
 * Начало и конец — крайние блоки записи, поэтому остаток всегда один кусок.
 */
export function trimCandidate(
    candidate: ExcerptCandidate,
    head: LineRange | null,
    tail: LineRange | null,
): ExcerptCandidate | null {
    const from = head
        ? Math.max(candidate.range.from, head.to + 1)
        : candidate.range.from;
    const to = tail
        ? Math.min(candidate.range.to, tail.from - 1)
        : candidate.range.to;

    return from <= to ? { ...candidate, range: { from, to } } : null;
}

/** Кандидаты без повторов: одинаковые вид, строки и причина — один. */
export function uniqueCandidates(
    candidates: readonly ExcerptCandidate[],
): ExcerptCandidate[] {
    const unique = new Map<string, ExcerptCandidate>();
    for (const candidate of candidates) {
        const { source, range, reason } = candidate;
        unique.set(`${source}|${range.from}|${range.to}|${reason}`, candidate);
    }

    return [...unique.values()];
}

/** Конец самого длинного диапазона в группе. */
const groupEnd = (members: readonly ExcerptCandidate[]): number =>
    Math.max(...members.map(member => member.range.to));

/**
 * Слияние: пересекающиеся и соприкасающиеся (следующая строка сразу за
 * предыдущей) кандидаты становятся одним отрывком; порядок — по месту в
 * записи.
 */
export function mergeCandidates(
    candidates: readonly ExcerptCandidate[],
): ExcerptGroup[] {
    const groups: ExcerptCandidate[][] = [];
    for (const candidate of [...candidates].sort(byPosition)) {
        const last = groups[groups.length - 1];
        if (last !== undefined && candidate.range.from <= groupEnd(last) + 1) {
            last.push(candidate);
        } else {
            groups.push([candidate]);
        }
    }

    return groups.map(members => ({
        range: { from: members[0].range.from, to: groupEnd(members) },
        heading: mergedHeading(members),
    }));
}
