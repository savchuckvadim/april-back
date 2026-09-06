import { AgendaCallRow } from './agenda';
import {
    ScoredSection,
    cleanAlternatives,
    compareSectionsWorstFirst,
    pickWorstSection,
} from './sections.util';

/** Звонок менеджера с худшим разделом и фразами «как можно было». */
export interface DigestItem {
    transcriptionId: string;
    callStartedAt: Date;
    section: string;
    asWas: string | null;
    alternatives: string[];
}

export interface DigestOptions {
    /** Сколько звонков в дайджесте (по умолчанию 3). */
    limit?: number;
}

export const DIGEST_DEFAULT_LIMIT = 3;
/** Не больше трёх фраз alternatives на звонок. */
export const DIGEST_MAX_ALTERNATIVES = 3;

interface DigestCandidate {
    row: AgendaCallRow;
    section: ScoredSection;
}

const compareCandidates = (a: DigestCandidate, b: DigestCandidate): number =>
    compareSectionsWorstFirst(a.section, b.section) ||
    a.row.callStartedAt.getTime() - b.row.callStartedAt.getTime() ||
    a.row.transcriptionId.localeCompare(b.row.transcriptionId);

/**
 * Утренний дайджест менеджера: 1–limit его звонков с худшими разделами
 * (relevance > 0, score не null), только разделы с непустыми alternatives,
 * до DIGEST_MAX_ALTERNATIVES фраз на звонок. Детерминированно.
 */
export function buildMorningDigest(
    rows: readonly AgendaCallRow[],
    managerId: string,
    options: DigestOptions = {},
): DigestItem[] {
    const limit = options.limit ?? DIGEST_DEFAULT_LIMIT;
    if (limit <= 0) {
        return [];
    }
    return rows
        .filter(row => row.managerId === managerId)
        .flatMap(row => {
            const section = pickWorstSection(row.sections, {
                requireAlternatives: true,
            });
            return section ? [{ row, section }] : [];
        })
        .sort(compareCandidates)
        .slice(0, limit)
        .map(({ row, section }) => ({
            transcriptionId: row.transcriptionId,
            callStartedAt: row.callStartedAt,
            section: section.section,
            asWas: section.asWas,
            alternatives: cleanAlternatives(section.alternatives).slice(
                0,
                DIGEST_MAX_ALTERNATIVES,
            ),
        }));
}
