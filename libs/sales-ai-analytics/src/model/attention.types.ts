import { MetricValue } from './metric';
import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';

/** Сигналы «Внимания» Фазы 1 (план §3, ТЗ FR-12) в порядке приоритета. */
export const ATTENTION_SIGNALS = [
    'risk',
    'no_data',
    'discipline',
    'next_step_drop',
    'plan_gap',
] as const;
export type AttentionSignal = (typeof ATTENTION_SIGNALS)[number];

export interface AttentionRiskCall {
    transcriptionId: string;
    /** Вид сигнала: promise / conflict / compliance / client_negative / urgent. */
    kind: string;
}

/** План CRM (сделано / запланировано) за окно. */
export interface AttentionDiscipline {
    callPlan: number;
    callDone: number;
    presentationPlan: number;
    presentationDone: number;
}

/** План руководителя против нормы (одна единица измерения). */
export interface AttentionPlanGap {
    norm: number;
    planHead: number;
}

export interface AttentionOutcomes {
    invoices: number;
    deals: number;
}

export interface AttentionLevelNorms {
    invoices?: number;
    deals?: number;
}

export interface AttentionManagerInput {
    managerId: string;
    /** Разобранных звонков окна. */
    n: number;
    /** Звонков в телефонии за окно (для no_data); undefined — неизвестно. */
    callsTotal?: number;
    /** Доли 0..1 «шаг с датой» за текущее и прошлое окно (как в пульсе). */
    nextStepRate: { current: MetricValue; previous: MetricValue };
    riskCalls: AttentionRiskCall[];
    discipline: AttentionDiscipline;
    planGap?: AttentionPlanGap;
    outcomes?: AttentionOutcomes;
    levelNorms?: AttentionLevelNorms;
}

export interface AttentionInput {
    managers: AttentionManagerInput[];
}

/** Опора карточки: код, значение, норма, n (0 — значение из настройки). */
export interface AttentionBasis {
    code: string;
    value: number;
    norm?: number;
    n: number;
    ci90?: [number, number];
}

export interface AttentionLink {
    managerId: string;
    callType?: string;
    transcriptionIds?: string[];
}

export interface AttentionItem {
    managerId: string;
    rank: number;
    signal: AttentionSignal;
    /** С какой фазы доступен сигнал (все правила — Фаза 1). */
    availableFrom: 1;
    headline: string;
    basis: AttentionBasis[];
    link: AttentionLink;
}

/** Кандидат карточки до ранжирования; severity: меньше — важнее. */
export interface AttentionCandidate extends Omit<AttentionItem, 'rank'> {
    severity: number;
}

export interface AttentionRules {
    maxItems: number;
    maxPerManager: number;
    /** no_data при n < noDataMinN (scoreNone). */
    noDataMinN: number;
    /** discipline только при плане ≥ disciplineMinPlan … */
    disciplineMinPlan: number;
    /** … и сделано < disciplineMinShare плана. */
    disciplineMinShare: number;
    /** next_step_drop только при n ≥ nextStepMinN в обоих окнах. */
    nextStepMinN: number;
    /** plan_gap при |planHead/norm − 1| ≥ planGapRatio. */
    planGapRatio: number;
}

export const ATTENTION_DEFAULT_RULES: AttentionRules = {
    maxItems: 7,
    maxPerManager: 3,
    noDataMinN: AI_ANALYTICS_THRESHOLDS.scoreNone,
    disciplineMinPlan: 10,
    disciplineMinShare: 0.5,
    nextStepMinN: 20,
    planGapRatio: 0.5,
};
