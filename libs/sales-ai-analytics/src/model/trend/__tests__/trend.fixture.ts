import { mulberry32, sampleNormal, seedOf } from '../../prng';
import type { TrendPoint } from '../trend.types';

/**
 * Синтетические ряды для спек трендов: шум N(mean, sigma²) из
 * детерминированного ГПСЧ библиотеки (mulberry32 + Бокс–Мюллер) и тот же
 * ряд с внедрённым сдвигом уровня. `Math.random` в спеках не используется:
 * приёмка «по 200 seed-ам» должна воспроизводиться.
 */
export interface SeriesShape {
    mean: number;
    sigma: number;
}

/** Уровень оценки 1–10 с недельным разбросом полбалла. */
export const SCORE_SHAPE: SeriesShape = { mean: 6, sigma: 0.5 };

/** Ключи ISO-недель 2026 года с первой: 'YYYY-Www', сортируются как строки. */
export function weekKeys(count: number): string[] {
    return Array.from(
        { length: count },
        (_, index) => `2026-W${String(index + 1).padStart(2, '0')}`,
    );
}

/** Ряд без сдвига: `count` точек N(mean, sigma²) по seed. */
export function nullSeries(
    seed: number,
    count: number,
    shape: SeriesShape = SCORE_SHAPE,
): number[] {
    const random = mulberry32(seed);

    return Array.from(
        { length: count },
        () => shape.mean + shape.sigma * sampleNormal(random),
    );
}

/** Тот же шум, но с точки `shiftAt` уровень поднят на `delta`. */
export function shiftedSeries(
    seed: number,
    count: number,
    shiftAt: number,
    delta: number,
    shape: SeriesShape = SCORE_SHAPE,
): number[] {
    return nullSeries(seed, count, shape).map((value, index) =>
        index >= shiftAt ? value + delta : value,
    );
}

/** Точки ряда с ключами недель и объёмом n на точку. */
export function toPoints(
    values: readonly number[],
    n = 12,
    signature: string | null = null,
): TrendPoint[] {
    const keys = weekKeys(values.length);

    return values.map((value, index) => ({
        key: keys[index],
        value,
        n,
        signature,
    }));
}

/** Seed прогона спеки по её имени и номеру симуляции. */
export const specSeed = (name: string, iteration: number): number =>
    seedOf('demo.bitrix24.ru', name, iteration);
