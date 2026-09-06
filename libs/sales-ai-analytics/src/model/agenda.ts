import {
    AnalysisSection,
    ScoredSection,
    nonEmptyText,
    pickWorstSection,
} from './sections.util';

export type AgendaSection = AnalysisSection;

/** Возражение клиента из разбора: категория, цитата, отработано ли, исход. */
export interface AgendaObjection {
    category: string | null;
    quote: string | null;
    handled: boolean | null;
    outcome: string | null;
}

/** Строка звонка для повестки РОПа (text нужен только для charOffset). */
export interface AgendaCallRow {
    transcriptionId: string;
    managerId: string | null;
    callType: string | null;
    callStartedAt: Date;
    score: number | null;
    sections: AgendaSection[];
    objections: AgendaObjection[];
    riskFlags: string[];
    text: string | null;
}

/** Почему звонок попал в повестку (в порядке приоритета). */
export type AgendaReasonKind = 'risk' | 'objection' | 'section';

export interface AgendaItem {
    transcriptionId: string;
    managerId: string | null;
    callType: string | null;
    kind: AgendaReasonKind;
    reason: string;
    quote: string;
    charOffset: number | null;
    score: number | null;
}

export interface AgendaOptions {
    /** Сколько звонков в повестке (по умолчанию 3). */
    limit?: number;
}

export const AGENDA_DEFAULT_LIMIT = 3;
/** Исход возражения, который считаем спорным наравне с handled = false. */
export const AGENDA_DISPUTED_OUTCOME = 'disengaged';

const REASON_TIER: Record<AgendaReasonKind, number> = {
    risk: 0,
    objection: 1,
    section: 2,
};

interface AgendaCandidate {
    row: AgendaCallRow;
    kind: AgendaReasonKind;
    /** Внутри одного kind: меньше — важнее. */
    severity: number;
    reason: string;
    quote: string;
}

const isDisputed = (objection: AgendaObjection): boolean =>
    objection.handled === false ||
    objection.outcome === AGENDA_DISPUTED_OUTCOME;

const firstQuote = (objections: readonly AgendaObjection[]): string | null =>
    objections
        .map(objection => nonEmptyText(objection.quote))
        .find(quote => quote !== null) ?? null;

function sectionReason(section: ScoredSection): string {
    return `Слабый раздел «${section.section}»: ${section.score}/10`;
}

function objectionReason(objection: AgendaObjection): string {
    const category = objection.category ? ` (${objection.category})` : '';
    const detail =
        objection.handled === false ? 'не отработано' : 'клиент отстранился';
    return `Спорное возражение${category}: ${detail}`;
}

function toCandidate(row: AgendaCallRow): AgendaCandidate | null {
    const worst = pickWorstSection(row.sections);
    const fallbackQuote = worst ? nonEmptyText(worst.asWas) : null;

    if (row.riskFlags.length > 0) {
        return {
            row,
            kind: 'risk',
            severity: -row.riskFlags.length,
            reason: `Риск-флаги: ${[...row.riskFlags].sort().join(', ')}`,
            quote: firstQuote(row.objections) ?? fallbackQuote ?? '',
        };
    }
    const disputed = row.objections.filter(isDisputed);
    if (disputed.length > 0) {
        const [first] = disputed;
        return {
            row,
            kind: 'objection',
            severity: -disputed.length,
            reason: objectionReason(first),
            quote: firstQuote(disputed) ?? fallbackQuote ?? '',
        };
    }
    if (worst) {
        return {
            row,
            kind: 'section',
            severity: worst.score,
            reason: sectionReason(worst),
            quote: fallbackQuote ?? '',
        };
    }
    return null;
}

const compareNullableAsc = (a: number | null, b: number | null): number => {
    if (a === null || b === null) {
        return a === b ? 0 : a === null ? 1 : -1;
    }
    return a - b;
};

const compareCandidates = (a: AgendaCandidate, b: AgendaCandidate): number =>
    REASON_TIER[a.kind] - REASON_TIER[b.kind] ||
    a.severity - b.severity ||
    compareNullableAsc(a.row.score, b.row.score) ||
    a.row.callStartedAt.getTime() - b.row.callStartedAt.getTime() ||
    a.row.transcriptionId.localeCompare(b.row.transcriptionId);

/** Сначала по одному звонку на менеджера, затем добор до limit по порядку. */
function selectDiverse(
    sorted: readonly AgendaCandidate[],
    limit: number,
): AgendaCandidate[] {
    const selected: AgendaCandidate[] = [];
    const usedManagers = new Set<string>();
    for (const candidate of sorted) {
        if (selected.length >= limit) {
            break;
        }
        const key = candidate.row.managerId ?? '';
        if (usedManagers.has(key)) {
            continue;
        }
        usedManagers.add(key);
        selected.push(candidate);
    }
    for (const candidate of sorted) {
        if (selected.length >= limit) {
            break;
        }
        if (!selected.includes(candidate)) {
            selected.push(candidate);
        }
    }
    return selected.sort(compareCandidates);
}

function toItem(candidate: AgendaCandidate): AgendaItem {
    const { row, quote } = candidate;
    const offset =
        quote !== '' && row.text !== null ? row.text.indexOf(quote) : -1;
    return {
        transcriptionId: row.transcriptionId,
        managerId: row.managerId,
        callType: row.callType,
        kind: candidate.kind,
        reason: candidate.reason,
        quote,
        charOffset: offset >= 0 ? offset : null,
        score: row.score,
    };
}

/**
 * Повестка РОПа: до limit звонков, детерминированно. Приоритет: риск-флаги →
 * спорные возражения (handled = false или outcome = disengaged) → худший
 * оценённый раздел (relevance > 0). Цитата — из возражения или asWas раздела,
 * charOffset — позиция цитаты в тексте (null, если текста нет / не найдена).
 * Пока есть звонки других менеджеров — не больше одного звонка на менеджера.
 */
export function buildAgenda(
    rows: readonly AgendaCallRow[],
    options: AgendaOptions = {},
): AgendaItem[] {
    const limit = options.limit ?? AGENDA_DEFAULT_LIMIT;
    if (limit <= 0) {
        return [];
    }
    const sorted = rows
        .map(toCandidate)
        .filter((candidate): candidate is AgendaCandidate => candidate !== null)
        .sort(compareCandidates);
    return selectDiverse(sorted, limit).map(toItem);
}
