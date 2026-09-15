/**
 * Выход новичка на темп (ramp) — план `ai-sales-analytics`, §4.6 и §4.9;
 * Фаза 2, поток `p2-model-forecast-plan`.
 *
 * `R(τ) = 1 − exp(−τ/τ₀)` — доля, на которую новичок уже вышел на режим.
 * Надбавка `ramp_volume_boost·(1 − R(τ))` применяется **к цели** менеджера,
 * а не к норме отдела: политика РОПа «новичку дать больше объёма» не должна
 * искажать оценку нормы полосы стажа (решение ревизии v3).
 *
 * Чистая математика: без DI, Bitrix и Prisma, без `Date.now`/`Math.random`.
 */

import { registryDefault } from '../params/registry.access';

/** Дефолты реестра, участвующие в ramp. */
export const RAMP_DEFAULTS = {
    /** `ramp_tau0_months` — характерное время выхода новичка. */
    tau0Months: registryDefault('ramp_tau0_months'),
    /** `ramp_volume_boost` — надбавка к цели по объёму. */
    volumeBoost: registryDefault('ramp_volume_boost'),
} as const;

/** Настройки надбавки новичку. */
export interface RampOptions {
    /** `ramp_tau0_months`. */
    readonly tau0Months?: number;
    /** `ramp_volume_boost`; 0 отключает надбавку. */
    readonly volumeBoost?: number;
}

/** Цель после надбавки новичку с разложением на множители. */
export interface RampedTarget {
    readonly value: number;
    /** `R(τ)` — доля выхода на режим. */
    readonly ramp: number;
    /** `1 + boost·(1 − R(τ))` — применённый множитель. */
    readonly multiplier: number;
}

const finite = (value: number | undefined, fallback = 0): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * `R(τ) = 1 − exp(−τ/τ₀)`: 0 в день выхода, ≈ 0,63 через τ₀ месяцев,
 * ≈ 0,95 через 3·τ₀. Отрицательный стаж считается нулевым.
 */
export function rampFactor(
    tenureMonths: number,
    tau0: number = RAMP_DEFAULTS.tau0Months,
): number {
    const tenure = Math.max(0, finite(tenureMonths));
    const tau = finite(tau0, RAMP_DEFAULTS.tau0Months);
    if (tau <= 0) {
        return 1;
    }

    return 1 - Math.exp(-tenure / tau);
}

/**
 * Надбавка новичку к цели: `G·(1 + boost·(1 − R(τ)))`. У опытного
 * менеджера `R(τ) → 1` и множитель вырождается в единицу.
 */
export function applyRampToTarget(
    target: number,
    tenureMonths: number,
    options: RampOptions = {},
): RampedTarget {
    const ramp = rampFactor(
        tenureMonths,
        options.tau0Months ?? RAMP_DEFAULTS.tau0Months,
    );
    const boost = Math.max(
        0,
        finite(options.volumeBoost, RAMP_DEFAULTS.volumeBoost),
    );
    const multiplier = 1 + boost * (1 - ramp);

    return {
        value: Math.max(0, finite(target)) * multiplier,
        ramp,
        multiplier,
    };
}
