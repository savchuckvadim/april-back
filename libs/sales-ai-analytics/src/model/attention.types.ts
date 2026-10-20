import { registryDefault } from '../params/registry.access';
import { ConfidenceLevel, MetricValue } from './metric';
import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';
import type { TrendDirection, TrendSignalKind } from './trend/trend.types';

/**
 * Сигналы «Внимания» в порядке приоритета (решение владельца 19.10.2026,
 * этап 2 плана ai/tasks/2026-10-19-ai-focus-plan.md): сначала слабые
 * презентации и слабая доработка, затем прочие звонки с низкой оценкой,
 * потом правила Фазы 1 про данные и план, риск — ПОСЛЕДНИМ и только с
 * цитатой; дальше Фаза 3 — расхождение «метрика ↔ противовес» (П9) и
 * сдвиг / дрейф ряда вниз (П1).
 */
export const ATTENTION_SIGNALS = [
    'weak_presentation',
    'weak_followup',
    'low_score_calls',
    'no_data',
    'discipline',
    'next_step_drop',
    'plan_gap',
    'risk',
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
    /**
     * Зерно ряда: month — закрытые месяцы, `sinceWeek` тогда неделя
     * первого числа месяца (заголовок называет месяц). Нет — недели.
     */
    grain?: AttentionTrendGrain;
    /**
     * Единица величины: share — доля 0..1 (заголовок в пунктах), value —
     * баллы или штуки. Нет — value.
     */
    unit?: AttentionTrendUnit;
}

/** Зерно ряда сигнала тренда. */
export type AttentionTrendGrain = 'week' | 'month';

/** Единица величины сигнала тренда. */
export type AttentionTrendUnit = 'share' | 'value';

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
    /**
     * Вид сигнала: действующий риск-флаг (conflict / compliance /
     * door_closed) либо urgent. Отменённые коды правило отбрасывает.
     */
    kind: string;
}

/** Средняя оценка раздела (шкала 1–10) по n оценённым звонкам. */
export interface AttentionSectionMean {
    section: string;
    mean: number;
    n: number;
}

/**
 * Презентации менеджера за период: средние разделов «Выявление
 * потребностей» и «Презентация под потребности» и звонки, где один из
 * разделов слабый (для ссылки карточки).
 */
export interface AttentionPresentationFacts {
    /** Звонков-презентаций с разбором. */
    n: number;
    sections: AttentionSectionMean[];
    /** Id звонков со слабым разделом (оценка не выше порога). */
    weakCallIds: string[];
}

/**
 * Доработка (refine / decision) за период: возражения без отработки,
 * следующий шаг без даты, средние разделов «Работа с возражениями» и
 * «Закрытие разговора», звонки с любым из этих признаков.
 */
export interface AttentionFollowupFacts {
    /** Звонков доработки с разбором. */
    n: number;
    /** Возражений с известным исходом отработки; из них не отработано. */
    objectionsKnown: number;
    objectionsUnhandled: number;
    /** Звонков с назначенным следующим шагом; из них без даты. */
    nextStepSet: number;
    nextStepNoDate: number;
    sections: AttentionSectionMean[];
    weakCallIds: string[];
}

/** Звонок с низкой общей оценкой (шкала 1–10). */
export interface AttentionLowScoreCall {
    transcriptionId: string;
    callType: string | null;
    score: number;
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
    /** Презентации периода (этап 2); нет фактов — правило молчит. */
    presentation?: AttentionPresentationFacts;
    /** Доработка периода (этап 2); нет фактов — правило молчит. */
    followup?: AttentionFollowupFacts;
    /** Звонки с низкой оценкой (этап 2); нет списка — правило молчит. */
    lowScoreCalls?: AttentionLowScoreCall[];
    /**
     * Средние разделов по отделу для сравнения («ниже отдела на …»); нет —
     * buildAttention считает их сам по всем менеджерам входа.
     */
    sectionBenchmarks?: AttentionSectionMean[];
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
    /** Раздел слабый, если средняя не выше (реестр weak_section_score_max). */
    weakSectionScoreMax: number;
    /** …или ниже среднего по отделу на столько баллов (weak_section_gap). */
    weakSectionGap: number;
    /** Средняя раздела считается только при n раздела не меньше. */
    weakSectionMinN: number;
    /** Звонок слабый при общей оценке не выше (low_score_call_max). */
    lowScoreCallMax: number;
    /**
     * Доля «не отработано» / «без даты» у доработки, с которой сигнал
     * срабатывает (weak_followup_share_min).
     */
    weakFollowupShareMin: number;
}

export const ATTENTION_DEFAULT_RULES: AttentionRules = {
    maxItems: 7,
    maxPerManager: 3,
    noDataMinN: AI_ANALYTICS_THRESHOLDS.scoreNone,
    disciplineMinPlan: 10,
    disciplineMinShare: 0.5,
    nextStepMinN: 20,
    planGapRatio: 0.5,
    weakSectionScoreMax: registryDefault('weak_section_score_max'),
    weakSectionGap: registryDefault('weak_section_gap'),
    weakSectionMinN: AI_ANALYTICS_THRESHOLDS.scoreNone,
    lowScoreCallMax: registryDefault('low_score_call_max'),
    weakFollowupShareMin: registryDefault('weak_followup_share_min'),
};
