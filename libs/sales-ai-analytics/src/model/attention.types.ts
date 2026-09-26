import { ConfidenceLevel, MetricValue } from './metric';
import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';
import type { TrendDirection, TrendSignalKind } from './trend/trend.types';

/**
 * Сигналы «Внимания» в порядке приоритета: Фаза 1 (план §3, ТЗ FR-12),
 * затем Фаза 3 — расхождение «метрика ↔ противовес» (П9) и сдвиг /
 * дрейф ряда вниз (П1).
 */
export const ATTENTION_SIGNALS = [
    'risk',
    'no_data',
    'discipline',
    'next_step_drop',
    'plan_gap',
    'goodhart',
    'trend_shift',
    'trend_drift',
] as const;
export type AttentionSignal = (typeof ATTENTION_SIGNALS)[number];

/** С какой фазы доступен сигнал: правила Фазы 1 либо Фазы 3. */
export type AttentionAvailableFrom = 1 | 3;

/** Сигнал тренда ряда менеджера с подписью метрики для заголовка. */
export interface AttentionTrendSignal {
    metric: string;
    /** Подпись метрики для человека («оценка», «звонок → презентация»). */
    title: string;
    kind: TrendSignalKind;
    direction: TrendDirection;
    sinceWeek: string;
    /** Величина в единицах метрики. */
    magnitude: number;
    confidence: ConfidenceLevel;
}

/** Флаг детектора Гудхарта с подписями обеих метрик. */
export interface AttentionGoodhartFlag {
    pair: string;
    pressure: string;
    pressureTitle: string;
    counter: string;
    counterTitle: string;
    fromKey: string;
    toKey: string;
    /** Относительное изменение сглаженного давления, доля (> 0). */
    pressureChange: number;
    /** Относительное изменение сглаженного противовеса, доля (< 0). */
    counterChange: number;
    /** Общих месяцев окна. */
    points: number;
}

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
    /** Сигналы трендов строки (Фаза 3, П1); нет снапшота — undefined. */
    trendSignals?: AttentionTrendSignal[];
    /** Флаги детектора Гудхарта, худший противовес первым (Фаза 3, П9). */
    goodhart?: AttentionGoodhartFlag[];
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
    /** С какой фазы доступен сигнал: 1 — правила Фазы 1, 3 — тренды и Гудхарт. */
    availableFrom: AttentionAvailableFrom;
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
