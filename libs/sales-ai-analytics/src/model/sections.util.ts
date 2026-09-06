/** Раздел рубрики разбора звонка с релевантностью, оценкой и фразами. */
export interface AnalysisSection {
    section: string;
    relevance: number;
    score: number | null;
    asWas: string | null;
    alternatives: string[];
}

/** Оценённый раздел: relevance > 0 и score не null. */
export interface ScoredSection extends AnalysisSection {
    score: number;
}

/** Непустая строка → она же, иначе null. */
export const nonEmptyText = (
    value: string | null | undefined,
): string | null => (value && value.trim() !== '' ? value : null);

/** Только непустые альтернативные фразы. */
export const cleanAlternatives = (
    alternatives: readonly string[] | null | undefined,
): string[] => (alternatives ?? []).filter(item => nonEmptyText(item) !== null);

const isScored = (section: AnalysisSection): section is ScoredSection =>
    section.relevance > 0 && section.score !== null;

/**
 * Детерминированный порядок «от худшего»: ниже оценка → выше релевантность →
 * имя раздела по алфавиту.
 */
export const compareSectionsWorstFirst = (
    a: ScoredSection,
    b: ScoredSection,
): number =>
    a.score - b.score ||
    b.relevance - a.relevance ||
    a.section.localeCompare(b.section);

/**
 * Худший оценённый раздел звонка (relevance > 0, score не null); при
 * requireAlternatives учитываются только разделы с непустыми alternatives.
 */
export function pickWorstSection(
    sections: readonly AnalysisSection[],
    options: { requireAlternatives?: boolean } = {},
): ScoredSection | null {
    const candidates = sections
        .filter(isScored)
        .filter(
            section =>
                !options.requireAlternatives ||
                cleanAlternatives(section.alternatives).length > 0,
        )
        .sort(compareSectionsWorstFirst);
    return candidates[0] ?? null;
}
