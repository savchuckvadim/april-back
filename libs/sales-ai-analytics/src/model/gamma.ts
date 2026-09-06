import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';

/**
 * 90 %-интервал интенсивности с апостериором Gamma(shape, rate) — гамма-
 * Пуассон плана (§4.2, `intervalKind: gamma` для темпов и `*_rate`).
 *
 * Квантили гаммы — приближение Уилсона–Хилферти: для χ²(ν)
 * q_p ≈ ν·(1 − 2/(9ν) + z_p·√(2/(9ν)))³, а Gamma(α, β) = χ²(2α)/(2β), откуда
 * q_p ≈ (α/β)·(1 − 1/(9α) + z_p·√(1/(9α)))³.
 * Точность: относительная ошибка квантилей < 1 % при α ≥ 2 и единицы
 * процентов при 1 ≤ α < 2. В усадке α = s̃ + κ·μ, т. е. при κ·μ ≥ 2 (κ = 30,
 * μ ≥ 0,07) приближение достаточно для витрины; ниже — интервал
 * ориентировочный. Нижняя граница не опускается ниже нуля.
 *
 * shape = 0 — вырожденный апостериор в нуле → [0, 0]; shape < 0, rate ≤ 0
 * или NaN → интервала нет (null).
 */
export function gammaInterval(
    shape: number,
    rate: number,
    z: number = AI_ANALYTICS_THRESHOLDS.z90,
): [number, number] | null {
    if (
        !Number.isFinite(shape) ||
        !Number.isFinite(rate) ||
        shape < 0 ||
        rate <= 0
    ) {
        return null;
    }
    if (shape === 0) {
        return [0, 0];
    }
    const mean = shape / rate;
    const spread = Math.sqrt(1 / (9 * shape));
    const bias = 1 - 1 / (9 * shape);
    const quantile = (sign: -1 | 1): number =>
        mean * Math.pow(Math.max(0, bias + sign * z * spread), 3);
    return [quantile(-1), quantile(1)];
}
