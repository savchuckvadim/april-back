/**
 * Калибровочный контур оценки β (план `ai-sales-analytics`, §4.4 «мощность
 * и гейт», §4.11 «проверки»): наклон калибровки с 90 %-интервалом,
 * калибровочный график по `beta_calibration_bins` корзинам и плацебо (1)
 * с лидом `S̄_{m,w+k}`.
 *
 * - Наклон: логит-регрессия `y` на линейный предиктор `η` модели без
 *   штрафа (свободный член + наклон); у верной модели наклон ≈ 1,
 *   у переобученной/зашумлённой — заметно меньше 1.
 * - Корзины: квантили предсказанной `p̂`, в каждой — среднее `p̂`, доля
 *   исходов и интервал Уилсона.
 * - Плацебо (`beta-placebo.ts`): в pooled-дизайн одновременно входят `S_i`
 *   и лид; проверка пройдена, если 90 %-интервал коэффициента при лиде
 *   накрывает 0. Без лида результата нет (null — ни pass, ни fail).
 */
import { registryDefault } from '../params/registry.access';
import { BETA_COLUMN, BETA_FIT_DEFAULTS, betaEstimateOf } from './beta-fit';
import type { BetaFit, BetaModelFit } from './beta-fit.types';
import { fitLogisticRidge } from './beta-irls';
import {
    type PlaceboLeadOptions,
    type PlaceboLeadResult,
    placeboLead,
} from './beta-placebo';
import type { BetaSample } from './beta-sample.types';
import { wilsonInterval } from './wilson';

export {
    PLACEBO_LEAD_COLUMN,
    type PlaceboLeadOptions,
    type PlaceboLeadResult,
    placeboLead,
} from './beta-placebo';

/** Дефолты калибровки — из реестра. */
export const BETA_CALIBRATION_DEFAULTS = {
    /** `beta_calibration_bins` — корзин калибровочного графика. */
    bins: registryDefault('beta_calibration_bins'),
    /** `n_min_none` — ниже наклон и корзины не считаются. */
    minN: BETA_FIT_DEFAULTS.minN,
} as const;

/** Имена столбцов дизайна наклона калибровки. */
export const CALIBRATION_COLUMN = {
    intercept: 'alpha',
    slope: 'slope',
} as const;

/** Наклон калибровки `y ~ a + b·η`. */
export interface CalibrationSlope {
    readonly slope: number;
    readonly se: number;
    readonly ci90: readonly [number, number];
    /** 90 %-интервал накрывает 1 — условие гейта. */
    readonly coversOne: boolean;
    readonly n: number;
}

/** Корзина калибровочного графика. */
export interface CalibrationBin {
    readonly binIndex: number;
    readonly n: number;
    readonly predictedMean: number;
    readonly observedShare: number;
    readonly ci90: readonly [number, number];
}

/** Сводка калибровки одной модели. */
export interface BetaCalibration {
    readonly slope: CalibrationSlope | null;
    readonly bins: readonly CalibrationBin[];
    readonly placebo: PlaceboLeadResult | null;
}

const meanOf = (values: readonly number[]): number =>
    values.reduce((acc, value) => acc + value, 0) / values.length;

/**
 * Наклон калибровки: логит-регрессия исхода на линейный предиктор `η`
 * без штрафа. null — строк меньше `n_min_none`, `η` вырожден или
 * подгонка не сошлась.
 */
export function calibrationSlope(
    y: readonly (0 | 1)[],
    eta: readonly number[],
    options: { readonly z?: number; readonly minN?: number } = {},
): CalibrationSlope | null {
    const n = Math.min(y.length, eta.length);
    const minN = options.minN ?? BETA_CALIBRATION_DEFAULTS.minN;
    const z = options.z ?? BETA_FIT_DEFAULTS.z90;
    if (n < minN || !eta.every(Number.isFinite)) {
        return null;
    }
    const centered = eta.slice(0, n);
    const centre = meanOf(centered);
    const fit = fitLogisticRidge({
        y: y.slice(0, n),
        columns: [centered.map(() => 1), centered.map(value => value - centre)],
        names: [CALIBRATION_COLUMN.intercept, CALIBRATION_COLUMN.slope],
        penalties: [0, 0],
    });
    if (fit.singular || !fit.converged) {
        return null;
    }
    const slope = fit.coefficients[1];
    const se = fit.standardErrors[1];
    const ci90: readonly [number, number] = [slope - z * se, slope + z * se];

    return {
        slope,
        se,
        ci90,
        coversOne: ci90[0] <= 1 && ci90[1] >= 1,
        n,
    };
}

/**
 * Калибровочный график: строки сортируются по `p̂` (при равенстве — по
 * индексу), делятся на `bins` корзин почти равного размера.
 */
export function calibrationBins(
    y: readonly (0 | 1)[],
    predicted: readonly number[],
    options: { readonly bins?: number; readonly z?: number } = {},
): CalibrationBin[] {
    const n = Math.min(y.length, predicted.length);
    const bins = Math.max(
        1,
        Math.floor(options.bins ?? BETA_CALIBRATION_DEFAULTS.bins),
    );
    if (n === 0) {
        return [];
    }
    const order = Array.from({ length: n }, (_, index) => index).sort(
        (a, b) => predicted[a] - predicted[b] || a - b,
    );
    const result: CalibrationBin[] = [];
    for (let bin = 0; bin < bins; bin += 1) {
        const from = Math.floor((bin * n) / bins);
        const to = Math.floor(((bin + 1) * n) / bins);
        if (to <= from) {
            continue;
        }
        const members = order.slice(from, to);
        const hits = members.filter(index => y[index] === 1).length;
        result.push({
            binIndex: bin,
            n: members.length,
            predictedMean: meanOf(members.map(index => predicted[index])),
            observedShare: hits / members.length,
            ci90: wilsonInterval(hits, members.length, options.z),
        });
    }

    return result;
}

/** Настройки сводки калибровки. */
export interface BetaCalibrationOptions {
    readonly bins?: number;
    readonly z?: number;
    /** Настройки плацебо (σ_u, d_eff и т. п.) — те же, что у оценки β. */
    readonly placebo?: PlaceboLeadOptions;
}

/** Калибровка модели по строкам выборки, на которых она подогнана. */
export function calibrateBetaModel(
    sample: BetaSample,
    model: BetaModelFit,
    options: BetaCalibrationOptions = {},
): BetaCalibration {
    const y = sample.rows.map(row => row.outcome);
    if (model.form === 'insufficient') {
        return { slope: null, bins: [], placebo: null };
    }

    return {
        slope: calibrationSlope(y, model.eta, { z: options.z }),
        bins: calibrationBins(y, model.predicted, options),
        placebo: placeboLead(sample, { z: options.z, ...options.placebo }),
    };
}

/**
 * Калибровка pooled-модели сводной оценки — вход гейта β. Плацебо берёт
 * σ_u и `d_eff` самой оценки, чтобы дизайны совпадали.
 */
export function calibrateBetaFit(
    sample: BetaSample,
    fit: BetaFit,
    options: BetaCalibrationOptions = {},
): BetaCalibration {
    return calibrateBetaModel(sample, fit.models.pooled, {
        ...options,
        placebo: {
            managerEffectSd: fit.managerEffectSd,
            designEffect: fit.designEffect,
            ...options.placebo,
        },
    });
}

/** Есть ли у pooled-модели оценка наклона β (для подписи и гейта). */
export const hasPooledBeta = (fit: BetaFit): boolean =>
    betaEstimateOf(fit.models.pooled, BETA_COLUMN.pooled) !== null;
