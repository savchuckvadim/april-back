/**
 * Циркулярная блочная перестановочная калибровка порогов (план Фазы 3,
 * П1). Под нулевой гипотезой «уровень ряда не менялся» порядок блоков
 * ряда произволен, а блоки длины L сохраняют зависимость соседних
 * недель. Семейство рядов (менеджеры × метрики) держит FWER ≤ `trend_fwer`
 * процедурой step-down max-T Вестфолла–Янга: ряды упорядочены по
 * наблюдаемой статистике, порог самого сильного — квантиль 1 − FWER
 * максимума по ВСЕМУ семейству на перемешанных рядах, порог следующего —
 * максимум уже без отвергнутых; первый неотвергнутый останавливает
 * цепочку. Так старый настоящий сдвиг у одного менеджера не поднимает
 * пороги всем остальным.
 *
 * Собственный свежий сдвиг ряда тоже не должен калибровать сам себя:
 * последние точки текущего выброса (не больше `holdout`) исключаются из
 * пула перестановок ряда, а недостающая длина добирается циркулярным
 * блочным бутстрепом того же пула. Поток случайности — mulberry32(seed);
 * `Math.random` запрещён.
 *
 * Чистые функции.
 */
import { mulberry32 } from '../prng';

/** Длина блока по умолчанию — кубический корень из длины ряда (≥ 1). */
export function defaultBlockLength(points: number): number {
    return Math.max(1, Math.round(Math.cbrt(Math.max(0, points))));
}

/**
 * Одно перемешивание: случайный сдвиг по кругу, нарезка на блоки длины
 * L и перестановка блоков Фишером–Йетсом из того же потока случайности.
 */
export function circularBlockShuffle(
    values: readonly number[],
    blockLength: number,
    random: () => number,
): number[] {
    const n = values.length;
    if (n < 2) return [...values];
    const length = Math.min(n, Math.max(1, Math.floor(blockLength)));
    const offset = Math.floor(random() * n);
    const rotated = values.map((_, index) => values[(index + offset) % n]);
    const blocks: number[][] = [];
    for (let start = 0; start < n; start += length) {
        blocks.push(rotated.slice(start, start + length));
    }
    for (let index = blocks.length - 1; index > 0; index -= 1) {
        const other = Math.floor(random() * (index + 1));
        [blocks[index], blocks[other]] = [blocks[other], blocks[index]];
    }

    return blocks.flat();
}

/**
 * Циркулярный блочный бутстреп: блоки длины L со случайных позиций
 * круга пула, пока не набрана нужная длина. Пустой пул → пустой ряд.
 */
export function circularBlockBootstrap(
    pool: readonly number[],
    length: number,
    blockLength: number,
    random: () => number,
): number[] {
    const m = pool.length;
    if (m === 0) return [];
    const block = Math.min(m, Math.max(1, Math.floor(blockLength)));
    const out: number[] = [];
    while (out.length < length) {
        const start = Math.floor(random() * m);
        for (let index = 0; index < block && out.length < length; index += 1) {
            out.push(pool[(start + index) % m]);
        }
    }

    return out;
}

/** Статистика ряда, чей порог калибруется (максимум CUSUM, дрейфа …). */
export type SeriesStatistic = (values: readonly number[]) => number;

export interface FamilyCalibrationOptions {
    seed: number;
    iterations: number;
    /** Допустимая вероятность хотя бы одного ложного флага на семейство. */
    fwer: number;
    /** Длина блока; не задана — `defaultBlockLength` по длине ряда. */
    blockLength?: number;
    /**
     * Сколько последних точек ряда исключить из его пула перестановок
     * (текущий выброс, см. `cusumExcursion`); не задано — ничего.
     */
    holdout?: (values: readonly number[]) => number;
}

export interface FamilyCalibration {
    /** Порог каждого ряда в порядке входа; короче двух точек — Infinity. */
    thresholds: number[];
    /** Порог первого шага: квантиль максимума по всему семейству. */
    threshold: number;
    iterations: number;
    /** Рядов в семействе (короче двух точек не участвуют). */
    series: number;
    /** Порядок квантиля максимума: 1 − FWER. */
    quantile: number;
}

/** Нулевой ряд той же длины: перестановка пула, добор бутстрепом. */
function nullSeriesOf(
    values: readonly number[],
    blockLength: number,
    holdout: number,
    random: () => number,
): number[] {
    const cut = Math.min(Math.max(0, Math.floor(holdout)), values.length - 2);
    const pool = cut > 0 ? values.slice(0, values.length - cut) : values;
    const shuffled = circularBlockShuffle(pool, blockLength, random);

    return cut > 0
        ? [
              ...shuffled,
              ...circularBlockBootstrap(shuffled, cut, blockLength, random),
          ]
        : shuffled;
}

/** Эмпирический квантиль порядка q: элемент сортированного массива. */
function quantileOf(sorted: readonly number[], q: number): number {
    const index = Math.min(sorted.length - 1, Math.floor(q * sorted.length));

    return sorted[index];
}

/**
 * Пороги семейства по step-down max-T: наблюдаемая статистика каждого
 * ряда, `iterations` перемешиваний каждого ряда, затем по убыванию
 * наблюдаемой статистики — квантиль 1 − FWER максимума по ещё не
 * отвергнутым рядам; ряд отвергнут, если его статистика строго выше
 * порога; первый неотвергнутый закрепляет свой порог за всеми ниже.
 * Пустое семейство → null.
 */
export function calibrateFamilyThresholds(
    family: readonly (readonly number[])[],
    statistic: SeriesStatistic,
    options: FamilyCalibrationOptions,
): FamilyCalibration | null {
    const members = family
        .map((values, index) => ({ values, index }))
        .filter(item => item.values.length >= 2);
    if (members.length === 0) return null;
    const iterations = Math.max(1, Math.floor(options.iterations));
    const quantile = 1 - Math.min(1, Math.max(0, options.fwer));
    const random = mulberry32(options.seed);
    const permuted = members.map(item => {
        const block =
            options.blockLength ?? defaultBlockLength(item.values.length);
        const holdout = options.holdout?.(item.values) ?? 0;
        const stats: number[] = [];
        for (let iteration = 0; iteration < iterations; iteration += 1) {
            stats.push(
                statistic(nullSeriesOf(item.values, block, holdout, random)),
            );
        }

        return { ...item, observed: statistic(item.values), stats };
    });
    const order = [...permuted].sort((a, b) => b.observed - a.observed);
    const thresholds = family.map(() => Number.POSITIVE_INFINITY);
    let first: number | null = null;
    let stopped: number | null = null;
    order.forEach((member, rank) => {
        if (stopped !== null) {
            thresholds[member.index] = stopped;
            return;
        }
        const rest = order.slice(rank);
        const maxima: number[] = [];
        for (let iteration = 0; iteration < iterations; iteration += 1) {
            maxima.push(Math.max(...rest.map(item => item.stats[iteration])));
        }
        maxima.sort((a, b) => a - b);
        const threshold = quantileOf(maxima, quantile);
        thresholds[member.index] = threshold;
        first ??= threshold;
        if (!(member.observed > threshold)) stopped = threshold;
    });

    return {
        thresholds,
        threshold: first ?? Number.POSITIVE_INFINITY,
        iterations,
        series: members.length,
        quantile,
    };
}
