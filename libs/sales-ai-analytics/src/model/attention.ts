import { ATTENTION_PHASE1_RULES } from './attention.rules';
import { ATTENTION_PHASE3_RULES } from './attention.rules.phase3';
import { departmentSectionBenchmarks } from './attention.rules.quality';
import {
    ATTENTION_DEFAULT_RULES,
    ATTENTION_SIGNALS,
    AttentionCandidate,
    AttentionInput,
    AttentionItem,
    AttentionManagerInput,
    AttentionRules,
    AttentionSignal,
} from './attention.types';

const SIGNAL_TIER: Record<AttentionSignal, number> = Object.fromEntries(
    ATTENTION_SIGNALS.map((signal, index) => [signal, index]),
) as Record<AttentionSignal, number>;

/** Сигнал → тяжесть → managerId: детерминированно при любом порядке входа. */
const compareCandidates = (
    a: AttentionCandidate,
    b: AttentionCandidate,
): number =>
    SIGNAL_TIER[a.signal] - SIGNAL_TIER[b.signal] ||
    a.severity - b.severity ||
    a.managerId.localeCompare(b.managerId);

/** Карточка без служебной тяжести, с рангом. */
const toItem = (
    candidate: AttentionCandidate,
    rank: number,
): AttentionItem => ({
    managerId: candidate.managerId,
    rank,
    signal: candidate.signal,
    availableFrom: candidate.availableFrom,
    headline: candidate.headline,
    basis: candidate.basis,
    link: candidate.link,
});

/**
 * Ориентир отдела для «ниже отдела на …»: менеджер без своих
 * sectionBenchmarks получает средние разделов по всем менеджерам входа.
 */
function withBenchmarks(
    managers: readonly AttentionManagerInput[],
): AttentionManagerInput[] {
    if (managers.every(manager => manager.sectionBenchmarks !== undefined)) {
        return [...managers];
    }
    const benchmarks = departmentSectionBenchmarks(managers);
    return managers.map(manager =>
        manager.sectionBenchmarks === undefined
            ? { ...manager, sectionBenchmarks: benchmarks }
            : manager,
    );
}

/**
 * «Внимание» РОПу (план §3, ТЗ FR-12): ≤ maxItems карточек, ≤ maxPerManager
 * на менеджера, порядок «сигнал → тяжесть → managerId», rank с 1.
 * Правила Фазы 1 — attention.rules.ts (порядок решения владельца
 * 19.10.2026): weak_presentation, weak_followup, low_score_calls
 * (attention.rules.quality.ts), no_data, discipline (не ставится
 * «закрывателю»), next_step_drop, plan_gap, risk — последним и только по
 * действующим флагам; Фазы 3 — attention.rules.phase3.ts: goodhart,
 * trend_shift, trend_drift. Каждая карточка несёт headline и basis с
 * числами, по которым она поставлена.
 */
const ATTENTION_RULES = [...ATTENTION_PHASE1_RULES, ...ATTENTION_PHASE3_RULES];

export function buildAttention(
    input: AttentionInput,
    rules: Partial<AttentionRules> = {},
): AttentionItem[] {
    const resolved: AttentionRules = { ...ATTENTION_DEFAULT_RULES, ...rules };
    const candidates = withBenchmarks(input.managers)
        .flatMap(manager =>
            ATTENTION_RULES.map(rule => rule(manager, resolved)),
        )
        .filter((item): item is AttentionCandidate => item !== null)
        .sort(compareCandidates);

    const perManager = new Map<string, number>();
    const selected: AttentionItem[] = [];
    for (const candidate of candidates) {
        if (selected.length >= resolved.maxItems) {
            break;
        }
        const used = perManager.get(candidate.managerId) ?? 0;
        if (used >= resolved.maxPerManager) {
            continue;
        }
        perManager.set(candidate.managerId, used + 1);
        selected.push(toItem(candidate, selected.length + 1));
    }
    return selected;
}
