import { registryDefault } from '../params/registry.access';
import {
    AgendaCandidate,
    AgendaThresholds,
    toAgendaCandidate,
} from './agenda.candidates';
import type {
    AgendaCallRow,
    AgendaItem,
    AgendaOptions,
    AgendaReasonKind,
} from './agenda.types';

export * from './agenda.types';
export { AGENDA_DISPUTED_OUTCOME } from './agenda.candidates';

export const AGENDA_DEFAULT_LIMIT = 3;

const REASON_TIER: Record<AgendaReasonKind, number> = {
    weak_presentation: 0,
    weak_followup: 1,
    low_score: 2,
    risk: 3,
    objection: 4,
    section: 5,
};

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
 * Повестка РОПа: до limit звонков, детерминированно. Приоритет (решение
 * владельца 19.10.2026): слабая презентация (у презентаций слаб раздел
 * потребностей или презентации) → слабая доработка (у refine / decision
 * возражение не отработано, шаг без даты или слаб раздел возражений /
 * закрытия) → низкая общая оценка → риск только по действующим флагам с
 * цитатой → запасные причины: спорное возражение, худший раздел
 * (agenda.candidates.ts). Цитата — из раздела, возражения или
 * доказательства флага; charOffset — позиция цитаты в тексте (null, если
 * текста нет / не найдена). Пока есть звонки других менеджеров — не больше
 * одного звонка на менеджера.
 */
export function buildAgenda(
    rows: readonly AgendaCallRow[],
    options: AgendaOptions = {},
): AgendaItem[] {
    const limit = options.limit ?? AGENDA_DEFAULT_LIMIT;
    if (limit <= 0) {
        return [];
    }
    const thresholds: AgendaThresholds = {
        weakSectionScoreMax:
            options.weakSectionScoreMax ??
            registryDefault('weak_section_score_max'),
        lowScoreCallMax:
            options.lowScoreCallMax ?? registryDefault('low_score_call_max'),
    };
    const sorted = rows
        .map(row => toAgendaCandidate(row, thresholds))
        .filter((candidate): candidate is AgendaCandidate => candidate !== null)
        .sort(compareCandidates);
    return selectDiverse(sorted, limit).map(toItem);
}
