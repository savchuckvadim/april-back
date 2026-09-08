/**
 * Словарь стадийных величин (план `ai-sales-analytics`, §4.1, §4.2, §4.8):
 * дефолты усадки и квантилей, исход сделки, формы θ стадии, фактов сроков и
 * лагов продаж.
 *
 * Вынесено из `stage-theta.ts`, чтобы рабочий файл оставался в пределах
 * 300 строк; публичный вход слоя прежний — `model/stage-theta`
 * реэкспортирует этот словарь.
 */
import type { ShrinkPrior, ShrinkRateResult } from './shrink';

/** Дефолты стадийных величин. */
export const STAGE_THETA_DEFAULTS = {
    /** κ_k до гейта Клейнмана — код реестра `kappa_edge_late`. */
    kappa: 30,
    /** Норма слоя до появления собственной оценки. */
    mu: 0,
} as const;

/** Квантили фактов сроков — те же, что показывает санити-панель. */
export const STAGE_SLA_QUANTILES = {
    p25: 0.25,
    p50: 0.5,
    p90: 0.9,
} as const;

/** Исход сделки целиком: продажа, отказ или ещё неизвестен. */
export const AI_DEAL_OUTCOMES = ['sale', 'lost', 'open'] as const;

export type AiDealOutcome = (typeof AI_DEAL_OUTCOMES)[number];

/** Норма слоя: общая на все стадии либо своя на каждую. */
export type StagePriorSource =
    | ShrinkPrior
    | Readonly<Record<string, ShrinkPrior>>;

export interface StageThetaOptions {
    /** Норма слоя μ и сила усадки κ (одна на все стадии либо по стадиям). */
    readonly prior?: StagePriorSource;
    /** Код стадии продажи; по умолчанию `sales_success`. */
    readonly successStageCode?: string;
    /** Квантиль интервала (по умолчанию z90). */
    readonly z?: number;
}

/** Вероятность продажи из стадии с усадкой к норме слоя. */
export interface StageTheta extends ShrinkRateResult {
    readonly stageCode: string;
    /** Порядок стадии в лестнице — по нему сортируется результат. */
    readonly order: number;
    /** Сделок с известным исходом: они и есть знаменатель. */
    readonly n: number;
    /** Из них дошедших до продажи. */
    readonly s: number;
    /** Сделок с неизвестным исходом — вне знаменателя. */
    readonly censored: number;
}

/** Факты сроков стадии в днях. */
export interface StageSlaFact {
    readonly p25: number;
    readonly p50: number;
    readonly p90: number;
    /** Закрытых эпизодов стадии в выборке. */
    readonly n: number;
}

export interface SaleLagsOptions {
    /** Стадия отсчёта лага; по умолчанию — начало первого эпизода сделки. */
    readonly fromStageCode?: string;
    /** Добавить открытые сделки цензурированными точками (для Каплана–Мейера). */
    readonly includeOpen?: boolean;
}

/**
 * Лаг одной сделки. Поле `days` — псевдоним `lagDays` под контракт `SaleLag`
 * из `lag-cdf.ts`, чтобы между слоями не понадобился адаптер.
 */
export interface SaleLagFact {
    readonly entityId: string;
    readonly episodeKey: string;
    readonly lagDays: number;
    readonly days: number;
    readonly censored: boolean;
}
