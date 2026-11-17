import type {
    AttentionPresentationSpirals,
    AttentionProgressFacts,
} from './attention.methodology.types';
import type {
    AttentionLowScoreCall,
    AttentionRules,
    AttentionSectionMean,
} from './attention.types';

/**
 * Типы фактов качества менеджера (`quality-facts.assembler.ts`).
 * Переехали из apps/kpi-report-sales (assembler/overview-model.types.ts,
 * 17.11.2026); модель обзора реэкспортирует их без изменений.
 */

/**
 * Пороги сигналов этапа 2 (реестр `weak_section_score_max`,
 * `weak_section_gap`, `low_score_call_max`, `weak_followup_share_min`, слой
 * портала): по ним собраны факты качества, по ним же правила «Внимания»
 * читают кэш обзора.
 */
export type AttentionThresholds = Pick<
    AttentionRules,
    | 'weakSectionScoreMax'
    | 'weakSectionGap'
    | 'lowScoreCallMax'
    | 'weakFollowupShareMin'
    | 'qualityScoreMin'
    | 'progressMovingMin'
    | 'progressNoQualityMinCalls'
>;

/** Презентации менеджера за период: средние разделов и слабые звонки. */
export interface ManagerPresentationFacts {
    n: number;
    sections: AttentionSectionMean[];
    weakCallIds: string[];
    /** Спирали презентаций (методика со спиралями); нет разборов со спиралями — поля нет. */
    spirals?: AttentionPresentationSpirals;
}

/** Доработка (refine / decision) за период. */
export interface ManagerFollowupFacts {
    n: number;
    objectionsKnown: number;
    objectionsUnhandled: number;
    nextStepSet: number;
    nextStepNoDate: number;
    sections: AttentionSectionMean[];
    weakCallIds: string[];
}

/**
 * Факты качества для сигналов этапа 2 (решение владельца 19.10.2026):
 * слабые презентации, слабая доработка, звонки с низкой оценкой.
 */
export interface ManagerQualityFacts {
    thresholds: AttentionThresholds;
    presentation: ManagerPresentationFacts;
    followup: ManagerFollowupFacts;
    lowScoreCalls: AttentionLowScoreCall[];
    /** Звонки с продвижением сделки без качества («купил бы и без менеджера»); у старого кэша нет. */
    progress?: AttentionProgressFacts;
}
