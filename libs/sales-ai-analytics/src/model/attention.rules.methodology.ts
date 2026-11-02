/**
 * Правила «Внимания» по фактам методики (этап 2 плана методики Полянского,
 * 02.11.2026): спирали презентации усиливают сигнал «слабые презентации»,
 * звонки с продвижением сделки без качества дают сигнал «купил бы и без
 * менеджера». Пороги — коды реестра `quality_progress_score_min`,
 * `deal_progress_moving_min`, `progress_no_quality_min_calls` (слой
 * портала); минимум спиралей — норма методики из самого разбора.
 *
 * Тексты по правилу владельца: по-русски, с числами, без кодов и формул;
 * строка «что сделать» — в словаре фронта по коду сигнала.
 */
import {
    ATTENTION_METHODOLOGY_BASIS_CODES,
    type AttentionPresentationSpirals,
} from './attention.methodology.types';
import type { AttentionRule } from './attention.rules';
import type {
    AttentionBasis,
    AttentionManagerInput,
    AttentionRules,
} from './attention.types';
import { RU_FORMS, ruCount, ruDecimal } from './ru-text.util';

/** Слабые спирали: текст части заголовка, опора, звонки ниже нормы, тяжесть 0–10. */
export interface WeakSpirals {
    text: string;
    basis: AttentionBasis;
    callIds: string[];
    /** Сопоставимо со средней раздела: 10 × среднее / норма, не больше 10. */
    severity: number;
}

/**
 * Спирали слабые, когда презентаций со спиралями не меньше weakSectionMinN,
 * а полных витков в среднем меньше нормы методики. Нормы нет (0) или
 * спирали не считались — null.
 */
export function weakSpiralsOf(
    spirals: AttentionPresentationSpirals | undefined,
    rules: AttentionRules,
): WeakSpirals | null {
    if (!spirals || spirals.minFull <= 0) return null;
    if (spirals.n < rules.weakSectionMinN) return null;
    if (spirals.meanFull >= spirals.minFull) return null;
    return {
        text:
            `полных спиралей в среднем ${ruDecimal(spirals.meanFull)} при норме ` +
            `${spirals.minFull} (меньше нормы в ${spirals.belowMinCallIds.length} из ` +
            `${ruCount(spirals.n, RU_FORMS.presentations)})`,
        basis: {
            code: ATTENTION_METHODOLOGY_BASIS_CODES.spiralsMean,
            value: spirals.meanFull,
            norm: spirals.minFull,
            n: spirals.n,
        },
        callIds: spirals.belowMinCallIds,
        severity: Math.min(10, (10 * spirals.meanFull) / spirals.minFull),
    };
}

/**
 * progress_without_quality — «клиент купил бы и без менеджера»: среди
 * звонков, где сделка продвинулась (не ниже deal_progress_moving_min),
 * не меньше progress_no_quality_min_calls звонков с оценкой ниже
 * quality_progress_score_min. Тяжесть — число таких звонков, затем худшая
 * оценка.
 */
export const progressWithoutQualityRule: AttentionRule = (
    manager: AttentionManagerInput,
    rules: AttentionRules,
) => {
    const facts = manager.progress;
    if (!facts || facts.calls.length < rules.progressNoQualityMinCalls) {
        return null;
    }
    const calls = facts.calls;
    const worst = Math.min(...calls.map(call => call.score));
    return {
        managerId: manager.managerId,
        signal: 'progress_without_quality',
        availableFrom: 1,
        severity: -calls.length + worst / 100,
        headline:
            `Сделки движутся без качества: у ${calls.length} из ` +
            `${ruCount(facts.n, RU_FORMS.calls)}, где сделка продвинулась, оценка ` +
            `ниже ${ruDecimal(rules.qualityScoreMin, 0)} из 10 — клиент купил бы и ` +
            `без менеджера; худшая — ${ruDecimal(worst)} из 10`,
        basis: [
            {
                code: ATTENTION_METHODOLOGY_BASIS_CODES.progressNoQualityCalls,
                value: calls.length,
                norm: rules.progressNoQualityMinCalls,
                n: facts.n,
            },
        ],
        link: {
            managerId: manager.managerId,
            transcriptionIds: calls
                .map(call => call.transcriptionId)
                .sort((a, b) => a.localeCompare(b)),
        },
    };
};
