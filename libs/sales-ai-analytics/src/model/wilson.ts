import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * Интервал Уилсона для доли successes/n (границы в долях 0..1).
 *
 * (p̂ + z²/2n ± z·√(p̂(1−p̂)/n + z²/4n²)) / (1 + z²/n)
 *
 * По умолчанию z = 1,645 (90 %): 4/35 → [0,052; 0,232]; 0/18 → верхняя ≈ 0,13
 * («правило трёх» ≤ 0,17). При n = 0 информации нет → [0, 1].
 */
export function wilsonInterval(
    successes: number,
    n: number,
    z: number = AI_ANALYTICS_THRESHOLDS.z90,
): [number, number] {
    if (!Number.isFinite(n) || n <= 0) {
        return [0, 1];
    }
    const hits = Math.min(Math.max(successes, 0), n);
    const p = hits / n;
    const z2 = z * z;
    const denominator = 1 + z2 / n;
    const center = p + z2 / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));

    return [
        clamp01((center - margin) / denominator),
        clamp01((center + margin) / denominator),
    ];
}
