/**
 * Квантиль по линейной интерполяции порядковых статистик (тип 7, как в R
 * и numpy): позиция `(n − 1)·q`, между соседями — линейно.
 *
 * Общий числовой примитив модели: одна и та же формула нужна и потолку
 * полосы стажа (`capacity.ts`, p90 дневного темпа), и фактам сроков по
 * стадиям (`stage-theta.ts`, p25/p50/p90 длительности эпизода). Две копии
 * формулы со временем разъезжаются, поэтому она здесь одна.
 *
 * Пустая выборка → 0, нечисловые значения отбрасываются, `q` зажимается
 * в `[0; 1]`. Округления нет: кому нужна защита от шума float — округляет
 * у себя (см. `stageQuantileOf`).
 */
export function quantileOf(values: readonly number[], q: number): number {
    const sorted = values
        .filter(value => Number.isFinite(value))
        .slice()
        .sort((a, b) => a - b);
    if (sorted.length === 0) {
        return 0;
    }
    const probability = Number.isFinite(q) ? Math.min(1, Math.max(0, q)) : 0;
    const position = (sorted.length - 1) * probability;
    const low = Math.floor(position);
    const high = Math.ceil(position);
    if (low === high) {
        return sorted[low];
    }

    return sorted[low] + (position - low) * (sorted[high] - sorted[low]);
}
