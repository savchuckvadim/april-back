import type {
    QualityHypothesisPair,
    QualityLink,
} from '../contracts/quality-link.types';

/**
 * Гипотеза портала «при качестве S нужно N презентаций» (план §4.4,
 * режим `betaSource: hypothesis`).
 *
 * РОП задаёт ≥ 2 пар; `β_h` — МНК по логарифмам `ln N = a − β·S`.
 * **Единственное применение — интерактивный калькулятор «что если»**:
 * в рычаги (`model/recommend.ts`), планы и советы `β_h` не попадает
 * никогда — режим `hypothesis` даёт множитель качества 1 (`model/qav.ts`).
 * Проверка данными идёт на шкале вероятности: пары согласны, если
 * `p̂(S_i)·N_i` постоянна в пределах интервала `p̂`.
 */
export const HYPOTHESIS_DEFAULTS = {
    /** Минимум пар для оценки (иначе гипотеза не задана). */
    minPairs: 2,
    /** Границы качества пары (`portal_quality_hypothesis`). */
    sMin: 3,
    sMax: 10,
    /** Допустимый разброс попарных β относительно β̂, %. */
    maxSpreadPct: 50,
    /** Веер калькулятора «что если»: ±50 % к β_h. */
    fanSpread: 0.5,
} as const;

/** Результат подгонки β гипотезы. */
export interface HypothesisFit {
    /** `β_h` — МНК по логарифмам; 0, если пар недостаточно. */
    readonly beta: number;
    /** Свободный член `a` в `ln N = a − β·S`. */
    readonly intercept: number;
    /** Пары, прошедшие валидацию (отсортированы по S). */
    readonly pairs: readonly QualityHypothesisPair[];
    /** Разброс попарных β относительно β̂, % (0 при одной паре). */
    readonly spreadPct: number;
    /** Пары согласованы: β > 0, все попарные β > 0, разброс в пределах. */
    readonly consistent: boolean;
}

/** Строка сверки пары гипотезы с данными. */
export interface HypothesisDataRow {
    readonly s: number;
    readonly n: number;
    /** `p̂(S)` из оценённой связи; null — данных на этом S нет. */
    readonly p: number | null;
    /** `p̂(S)·N` — ожидаемое число исходов по паре. */
    readonly expected: number | null;
    /** Интервал ожидаемого числа исходов из интервала `p̂`. */
    readonly interval: readonly [number, number] | null;
    /** Пара не выпадает из остальных. */
    readonly agrees: boolean;
}

/** Итог сверки гипотезы с данными. */
export interface HypothesisVsDataResult {
    /** Все пары имеют общую точку: `p̂(S_i)·N_i` можно считать постоянной. */
    readonly agrees: boolean;
    readonly rows: readonly HypothesisDataRow[];
}

/** Веер калькулятора «что если» (±`spread` к β_h). */
export interface HypothesisFanResult {
    readonly low: number | null;
    readonly mid: number | null;
    readonly high: number | null;
    /** Веер построен (режим `hypothesis` и β_h задан). */
    readonly applied: boolean;
}

const isValidPair = (pair: QualityHypothesisPair): boolean =>
    Number.isFinite(pair.s) &&
    Number.isFinite(pair.n) &&
    pair.s >= HYPOTHESIS_DEFAULTS.sMin &&
    pair.s <= HYPOTHESIS_DEFAULTS.sMax &&
    pair.n > 0;

/** Попарные наклоны `ln(N_i/N_j)/(S_j − S_i)` — мера согласованности. */
function pairwiseBetas(
    pairs: readonly QualityHypothesisPair[],
): readonly number[] {
    const betas: number[] = [];
    for (let i = 0; i < pairs.length; i += 1) {
        for (let j = i + 1; j < pairs.length; j += 1) {
            const span = pairs[j].s - pairs[i].s;
            if (span > 0) {
                betas.push(Math.log(pairs[i].n / pairs[j].n) / span);
            }
        }
    }

    return betas;
}

const EMPTY_FIT: HypothesisFit = {
    beta: 0,
    intercept: 0,
    pairs: [],
    spreadPct: 0,
    consistent: false,
};

/**
 * `β_h` методом наименьших квадратов по логарифмам: `ln N = a − β·S`.
 * Пары «30 презентаций при 8/10» и «50 при 5/10» дают
 * `β_h = ln(50/30)/3 ≈ 0,170`; пары «30 при 7» и «50 при 5» — `0,255`
 * (та же механика МНК, другое расстояние по шкале качества).
 */
export function fitHypothesisBeta(
    pairs: readonly QualityHypothesisPair[],
): HypothesisFit {
    const valid = pairs
        .filter(isValidPair)
        .map(pair => ({ s: pair.s, n: pair.n }))
        .sort((a, b) => a.s - b.s);
    if (valid.length < HYPOTHESIS_DEFAULTS.minPairs) {
        return { ...EMPTY_FIT, pairs: valid };
    }
    const meanS = valid.reduce((sum, p) => sum + p.s, 0) / valid.length;
    const logs = valid.map(pair => Math.log(pair.n));
    const meanLog = logs.reduce((sum, value) => sum + value, 0) / logs.length;
    const sxx = valid.reduce((sum, p) => sum + Math.pow(p.s - meanS, 2), 0);
    if (sxx <= 0) {
        return { ...EMPTY_FIT, pairs: valid };
    }
    const sxy = valid.reduce(
        (sum, pair, index) => sum + (pair.s - meanS) * (logs[index] - meanLog),
        0,
    );
    const beta = -(sxy / sxx);
    const betas = pairwiseBetas(valid);
    const scale = Math.max(Math.abs(beta), 1e-6);
    const spreadPct =
        betas.length > 1
            ? (100 * (Math.max(...betas) - Math.min(...betas))) / scale
            : 0;

    return {
        beta,
        intercept: meanLog + beta * meanS,
        pairs: valid,
        spreadPct,
        consistent:
            beta > 0 &&
            betas.every(value => value > 0) &&
            spreadPct <= HYPOTHESIS_DEFAULTS.maxSpreadPct,
    };
}

/**
 * Калькулятор «что если»: сколько активностей нужно при качестве
 * `sCurrent`, чтобы получить исход, который `anchorVolume` активностей
 * дают при качестве `sTarget` — `N = N_0·exp(β_h·(S_target − S_current))`.
 *
 * Числа «30 презентаций при 8/10» и `sCurrent = 4,8` дают ≈ 52.
 * В планы и рычаги результат не передаётся — только раскрытие РОПа.
 */
export function hypothesisRequiredVolume(input: {
    readonly beta: number;
    readonly anchorVolume: number;
    readonly sTarget: number;
    readonly sCurrent: number;
}): number | null {
    const { beta, anchorVolume, sTarget, sCurrent } = input;
    if (
        !Number.isFinite(beta) ||
        !Number.isFinite(anchorVolume) ||
        anchorVolume <= 0 ||
        !Number.isFinite(sTarget) ||
        !Number.isFinite(sCurrent)
    ) {
        return null;
    }

    return anchorVolume * Math.exp(beta * (sTarget - sCurrent));
}

/**
 * Веер ±50 % вокруг `β_h` (подпись «правило портала, не оценка»):
 * множитель объёма относительно `s_ref` при качестве `score`.
 * Вне режима `hypothesis` веер не строится.
 */
export function hypothesisFan(
    link: QualityLink,
    score: number,
    spread: number = HYPOTHESIS_DEFAULTS.fanSpread,
): HypothesisFanResult {
    const beta = link.hypothesisBeta;
    if (
        link.betaSource !== 'hypothesis' ||
        beta === null ||
        !Number.isFinite(score) ||
        !Number.isFinite(spread)
    ) {
        return { low: null, mid: null, high: null, applied: false };
    }
    const gap = link.sRef - score;
    const edges = [beta * (1 - spread), beta * (1 + spread)].map(value =>
        Math.exp(value * gap),
    );

    return {
        low: Math.min(...edges),
        mid: Math.exp(beta * gap),
        high: Math.max(...edges),
        applied: true,
    };
}

/** Пересечение интервалов ожидаемых исходов остальных пар. */
function othersInterval(
    intervals: readonly (readonly [number, number] | null)[],
    skip: number,
): readonly [number, number] | null {
    const rest = intervals.filter(
        (interval, index): interval is readonly [number, number] =>
            index !== skip && interval !== null,
    );
    if (rest.length === 0) {
        return null;
    }
    const low = Math.max(...rest.map(interval => interval[0]));
    const high = Math.min(...rest.map(interval => interval[1]));

    return [low, high];
}

/**
 * Сверка гипотезы с данными **на шкале вероятности** (план §4.4):
 * пары согласны, если `p̂(S_i)·N_i` постоянна в пределах интервала `p̂`,
 * то есть интервалы ожидаемых исходов имеют общую точку.
 */
export function hypothesisVsData(
    pairs: readonly QualityHypothesisPair[],
    pHat: (score: number) => number | null,
    ci: (score: number) => readonly [number, number] | null,
): HypothesisVsDataResult {
    const valid = pairs.filter(isValidPair);
    const intervals = valid.map(pair => {
        const bounds = ci(pair.s);

        return bounds
            ? ([bounds[0] * pair.n, bounds[1] * pair.n] as const)
            : null;
    });
    const rows = valid.map((pair, index) => {
        const p = pHat(pair.s);
        const own = intervals[index];
        const others = othersInterval(intervals, index);

        return {
            s: pair.s,
            n: pair.n,
            p,
            expected: p === null ? null : p * pair.n,
            interval: own,
            agrees:
                own !== null &&
                others !== null &&
                own[0] <= others[1] &&
                own[1] >= others[0],
        };
    });
    const known = intervals.filter(
        (interval): interval is readonly [number, number] => interval !== null,
    );
    const agrees =
        known.length === valid.length &&
        known.length > 0 &&
        Math.max(...known.map(interval => interval[0])) <=
            Math.min(...known.map(interval => interval[1]));

    return { agrees, rows };
}
