/**
 * Гейт публикации β с гистерезисом и счётчик «до оценки β» по фактическому
 * дизайну выборки (план `ai-sales-analytics`, §4.4 «мощность и гейт»,
 * §4.10 E1, §4.11 «ежемесячно»).
 *
 * Условия одного пересчёта: `SE(β̂_pooled) ≤ beta_gate_se`, 90 %-интервал
 * наклона калибровки накрывает 1, плацебо не провалено (null не
 * блокирует), доля протечек меток времени ≤ `dq_timestamp_leak_max`
 * (считает приложение, сюда приходит флаг). Публикация — когда условия
 * держатся `beta_gate_months` пересчётов подряд; срыв обнуляет серию.
 */
import { registryDefault } from '../params/registry.access';
import {
    BETA_POWER_DEFAULTS,
    type BetaGateCountdown,
    type BetaPowerDesign,
    betaGateCountdown,
} from './beta-power';
import type { BetaSample } from './beta-sample.types';

/** Почему пересчёт не прошёл гейт. */
export const AI_BETA_GATE_REASONS = [
    'se-missing',
    'se-above-target',
    'calibration-missing',
    'calibration-not-covering-one',
    'placebo-failed',
    'timestamp-leak',
] as const;

export type AiBetaGateReason = (typeof AI_BETA_GATE_REASONS)[number];

/** Дефолты гейта — из реестра. */
export const BETA_GATE_DEFAULTS = {
    /** `beta_gate_se` — целевая точность. */
    gateSe: registryDefault('beta_gate_se'),
    /** `beta_gate_months` — пересчётов подряд. */
    gateMonths: registryDefault('beta_gate_months'),
} as const;

export interface BetaGateEvaluationInput {
    /** `SE(β̂_pooled)`; null — оценки нет. */
    readonly se: number | null;
    /** 90 %-интервал наклона калибровки накрывает 1; null — наклона нет. */
    readonly calibrationCoversOne: boolean | null;
    /** Плацебо (1); null — не считалось и не блокирует. */
    readonly placeboPassed: boolean | null;
    /** Доля протечек меток времени в норме (`dq_timestamp_leak_max`). */
    readonly timestampLeakOk: boolean;
    /** Серия пройденных пересчётов до этого. */
    readonly previousStreak: number;
    readonly gateSe?: number;
    readonly gateMonths?: number;
}

export interface BetaGateResult {
    readonly passedNow: boolean;
    /** Серия пройденных пересчётов подряд, включая текущий. */
    readonly streak: number;
    /** `streak ≥ beta_gate_months` — β публикуется. */
    readonly published: boolean;
    readonly reasons: readonly AiBetaGateReason[];
}

/** Гейт одного пересчёта и обновление серии (гистерезис). */
export function evaluateBetaGate(
    input: BetaGateEvaluationInput,
): BetaGateResult {
    const gateSe = input.gateSe ?? BETA_GATE_DEFAULTS.gateSe;
    const gateMonths = input.gateMonths ?? BETA_GATE_DEFAULTS.gateMonths;
    const reasons: AiBetaGateReason[] = [];
    if (input.se === null || !Number.isFinite(input.se)) {
        reasons.push('se-missing');
    } else if (input.se > gateSe) {
        reasons.push('se-above-target');
    }
    if (input.calibrationCoversOne === null) {
        reasons.push('calibration-missing');
    } else if (!input.calibrationCoversOne) {
        reasons.push('calibration-not-covering-one');
    }
    if (input.placeboPassed === false) {
        reasons.push('placebo-failed');
    }
    if (!input.timestampLeakOk) {
        reasons.push('timestamp-leak');
    }
    const passedNow = reasons.length === 0;
    const previous = Math.max(0, Math.floor(input.previousStreak));
    const streak = passedNow ? previous + 1 : 0;

    return { passedNow, streak, published: streak >= gateMonths, reasons };
}

const sampleSd = (values: readonly number[]): number => {
    if (values.length < 2) {
        return 0;
    }
    const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
    const ss = values.reduce((acc, value) => acc + (value - mean) ** 2, 0);

    return Math.sqrt(ss / (values.length - 1));
};

/**
 * Фактический дизайн выборки для формулы мощности: `p̄ = events/n`,
 * `σ_S` — выборочное СКО S, `r` — надёжность (`icc_form` по умолчанию),
 * `d_eff` — ориентир плана либо свой множитель. Пустая выборка отдаёт
 * ориентиры плана.
 */
export function betaDesignFromSample(
    sample: BetaSample,
    options: {
        readonly reliability?: number | null;
        readonly designEffect?: number;
    } = {},
): BetaPowerDesign {
    const reliability =
        typeof options.reliability === 'number' &&
        Number.isFinite(options.reliability) &&
        options.reliability > 0
            ? options.reliability
            : BETA_POWER_DEFAULTS.reliability;
    const designEffect =
        options.designEffect ?? BETA_POWER_DEFAULTS.designEffect;
    if (sample.n === 0) {
        return {
            pBar: BETA_POWER_DEFAULTS.pBar,
            sdScore: BETA_POWER_DEFAULTS.sdScore,
            reliability,
            designEffect,
        };
    }
    const sd = sampleSd(sample.rows.map(row => row.score));

    return {
        pBar: sample.events / sample.n,
        sdScore: sd > 0 ? sd : BETA_POWER_DEFAULTS.sdScore,
        reliability,
        designEffect,
    };
}

/** Счётчик «до оценки β» по фактическому дизайну выборки. */
export function betaCountdownFromSample(
    sample: BetaSample,
    input: {
        readonly presentationsPerMonth: number;
        readonly reliability?: number | null;
        readonly designEffect?: number;
        readonly seTarget?: number;
        readonly gateMonths?: number;
    },
): BetaGateCountdown {
    return betaGateCountdown({
        presentations: sample.n,
        presentationsPerMonth: input.presentationsPerMonth,
        seTarget: input.seTarget ?? BETA_GATE_DEFAULTS.gateSe,
        gateMonths: input.gateMonths ?? BETA_GATE_DEFAULTS.gateMonths,
        design: betaDesignFromSample(sample, input),
    });
}
