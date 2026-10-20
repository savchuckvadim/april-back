/**
 * Правила «Внимания» этапа 2 (решение владельца 19.10.2026, план
 * ai/tasks/2026-10-19-ai-focus-plan.md): слабые презентации → слабая
 * доработка → прочие звонки с низкой оценкой — впереди остальных сигналов,
 * риск уходит последним. Пороги — коды реестра `weak_section_score_max`,
 * `weak_section_gap`, `low_score_call_max`, `weak_followup_share_min` (слой
 * портала), минимум n раздела — `n_min_none`. Слабые разделы и ориентир
 * отдела — attention.sections.util.ts.
 *
 * Тексты по правилу владельца: по-русски, с числами, без кодов, формул и
 * знаков; строка «что сделать» — в словаре фронта по коду сигнала.
 */
import type { AttentionRule } from './attention.rules';
import {
    ATTENTION_FOLLOWUP_CALL_TYPES,
    ATTENTION_FOLLOWUP_SECTIONS,
    ATTENTION_PRESENTATION_CALL_TYPES,
    ATTENTION_PRESENTATION_SECTIONS,
    ATTENTION_QUALITY_BASIS_CODES,
    weakSectionBasis,
    weakSectionText,
    weakSectionsOf,
} from './attention.sections.util';
import type {
    AttentionBasis,
    AttentionCandidate,
    AttentionRules,
} from './attention.types';
import { RU_FORMS, ruCount, ruDecimal } from './ru-text.util';

export * from './attention.sections.util';

const pct = (share: number): string => `${Math.round(share * 100)} %`;

const sortedIds = (ids: readonly string[]): string[] => [...ids].sort();

/**
 * weak_presentation — у звонков-презентаций слабы «Выявление потребностей»
 * или «Презентация под потребности»: средняя не выше порога либо ниже
 * отдела на заданный разрыв (при n раздела не меньше n_min_none).
 */
export const weakPresentationRule: AttentionRule = (manager, rules) => {
    const facts = manager.presentation;
    if (!facts) return null;
    const weak = weakSectionsOf(
        facts.sections,
        manager.sectionBenchmarks,
        ATTENTION_PRESENTATION_SECTIONS,
        rules,
    );
    if (weak.length === 0) return null;
    const parts = weak.map(item => weakSectionText(item, rules));
    return {
        managerId: manager.managerId,
        signal: 'weak_presentation',
        availableFrom: 1,
        severity: weak[0].section.mean,
        headline:
            `Слабые презентации: ${parts.join(', ')} — ` +
            `в среднем по ${ruCount(facts.n, RU_FORMS.reviewsDative)} презентаций`,
        basis: weak.map(item => weakSectionBasis(item, rules)),
        link: {
            managerId: manager.managerId,
            callType: ATTENTION_PRESENTATION_CALL_TYPES[0],
            ...(facts.weakCallIds.length
                ? { transcriptionIds: sortedIds(facts.weakCallIds) }
                : {}),
        },
    };
};

/**
 * Доля «не отработано» или «без даты» при достаточном n и не ниже порога
 * `weakFollowupShareMin` (реестр weak_followup_share_min); иначе null.
 */
function followupShare(
    hits: number,
    total: number,
    rules: AttentionRules,
): number | null {
    if (total < rules.weakSectionMinN) return null;
    const share = hits / total;
    return share >= rules.weakFollowupShareMin ? share : null;
}

/**
 * weak_followup — у звонков доработки (refine / decision) возражения не
 * отработаны или следующий шаг без даты в доле случаев не ниже порога
 * портала (по умолчанию половина), либо слабы «Работа с возражениями» /
 * «Закрытие разговора».
 */
export const weakFollowupRule: AttentionRule = (manager, rules) => {
    const facts = manager.followup;
    if (!facts) return null;
    const unhandled = followupShare(
        facts.objectionsUnhandled,
        facts.objectionsKnown,
        rules,
    );
    const noDate = followupShare(
        facts.nextStepNoDate,
        facts.nextStepSet,
        rules,
    );
    const weak = weakSectionsOf(
        facts.sections,
        manager.sectionBenchmarks,
        ATTENTION_FOLLOWUP_SECTIONS,
        rules,
    );
    if (unhandled === null && noDate === null && weak.length === 0) {
        return null;
    }
    const parts: string[] = [];
    const basis: AttentionBasis[] = [];
    if (unhandled !== null) {
        parts.push(
            `возражения не отработаны в ${pct(unhandled)} случаев ` +
                `(${facts.objectionsUnhandled} из ${facts.objectionsKnown})`,
        );
        basis.push({
            code: ATTENTION_QUALITY_BASIS_CODES.objectionUnhandledShare,
            value: unhandled,
            norm: rules.weakFollowupShareMin,
            n: facts.objectionsKnown,
        });
    }
    if (noDate !== null) {
        parts.push(
            `следующий шаг без даты в ${pct(noDate)} звонков ` +
                `(${facts.nextStepNoDate} из ${facts.nextStepSet})`,
        );
        basis.push({
            code: ATTENTION_QUALITY_BASIS_CODES.nextStepNoDateShare,
            value: noDate,
            norm: rules.weakFollowupShareMin,
            n: facts.nextStepSet,
        });
    }
    parts.push(...weak.map(item => weakSectionText(item, rules)));
    basis.push(...weak.map(item => weakSectionBasis(item, rules)));
    const shareSeverity = Math.min(
        ...[unhandled, noDate]
            .filter((share): share is number => share !== null)
            .map(share => 10 * (1 - share)),
    );
    const sectionSeverity = weak[0]?.section.mean ?? Infinity;
    return {
        managerId: manager.managerId,
        signal: 'weak_followup',
        availableFrom: 1,
        severity: Math.min(shareSeverity, sectionSeverity),
        headline:
            `Слабая доработка: ${parts.join(', ')} — ` +
            `по ${ruCount(facts.n, RU_FORMS.reviewsDative)} доработки`,
        basis,
        link: {
            managerId: manager.managerId,
            callType: ATTENTION_FOLLOWUP_CALL_TYPES[0],
            ...(facts.weakCallIds.length
                ? { transcriptionIds: sortedIds(facts.weakCallIds) }
                : {}),
        },
    };
};

/**
 * low_score_calls — прочие звонки с общей оценкой не выше
 * lowScoreCallMax; тяжесть — их число, затем худшая оценка.
 */
export const lowScoreCallsRule: AttentionRule = (manager, rules) => {
    const calls = (manager.lowScoreCalls ?? []).filter(
        call => call.score <= rules.lowScoreCallMax,
    );
    if (calls.length === 0) return null;
    const worst = Math.min(...calls.map(call => call.score));
    const candidate: AttentionCandidate = {
        managerId: manager.managerId,
        signal: 'low_score_calls',
        availableFrom: 1,
        severity: -calls.length + worst / 100,
        headline:
            `Звонки с низкой оценкой: ${calls.length} из ${manager.n} ` +
            `(оценка не выше ${ruDecimal(rules.lowScoreCallMax, 0)} из 10), ` +
            `худший — ${ruDecimal(worst)} из 10`,
        basis: [
            {
                code: ATTENTION_QUALITY_BASIS_CODES.lowScoreCalls,
                value: calls.length,
                norm: rules.lowScoreCallMax,
                n: manager.n,
            },
        ],
        link: {
            managerId: manager.managerId,
            transcriptionIds: sortedIds(
                calls.map(call => call.transcriptionId),
            ),
        },
    };
    return candidate;
};

/** Правила этапа 2 в порядке приоритета сигналов. */
export const ATTENTION_QUALITY_RULES: readonly AttentionRule[] = [
    weakPresentationRule,
    weakFollowupRule,
    lowScoreCallsRule,
];
