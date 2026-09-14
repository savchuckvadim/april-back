import { sampleGamma, sampleNormal } from '../model/prng';

/**
 * Синтетика счётов активностей для спек темпов (overdispersion,
 * activity-rate, posterior-coverage): только детерминированные потоки
 * `mulberry32` из model/prng — `Math.random` в спеках запрещён.
 */

/** Выше этого среднего произведение равномерных Кнута теряет точность. */
const KNUTH_MEAN_LIMIT = 500;

/**
 * Пуассон(mean): метод Кнута (произведение равномерных до exp(−mean)),
 * при mean > 500 — нормальное приближение с округлением.
 */
export function samplePoisson(mean: number, random: () => number): number {
    if (!(mean > 0)) {
        return 0;
    }
    if (mean > KNUTH_MEAN_LIMIT) {
        return Math.max(
            0,
            Math.round(mean + Math.sqrt(mean) * sampleNormal(random)),
        );
    }
    const limit = Math.exp(-mean);
    let count = 0;
    let product = 1;
    do {
        product *= random();
        count += 1;
    } while (product > limit);
    return count - 1;
}

/**
 * Сверхдисперсный счёт с квази-пуассоновской φ через гамма-смесь
 * (NegBin с r = mean/(φ − 1), т. е. φ = 1 + mean/r):
 * λ ~ Gamma(shape = mean/(φ − 1), scale = φ − 1) → E λ = mean,
 * Var λ = mean·(φ − 1); y ~ Poisson(λ) → Var y = mean + mean·(φ − 1) = φ·mean.
 * φ ≤ 1 — чистый Пуассон.
 */
export function sampleOverdispersedCount(
    mean: number,
    phi: number,
    random: () => number,
): number {
    if (!(phi > 1) || !(mean > 0)) {
        return samplePoisson(mean, random);
    }
    const scale = phi - 1;
    const lambda = sampleGamma(mean / scale, random) * scale;
    return samplePoisson(lambda, random);
}
