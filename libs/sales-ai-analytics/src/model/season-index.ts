/**
 * Сезонный индекс по месяцам года (план §4.7: `SI_p(h) = (n_h·s̃_p(h) +
 * κ_s·SI_0(h))/(n_h + κ_s)`, `s̃` — ratio-to-moving-average по темпам на
 * рабочий день; Фаза 4, поток `p4-forecast-model`).
 *
 * Метод: центрированная 12-месячная скользящая средняя (2×12 MA), отношение
 * темпа месяца к ней, средний коэффициент по каждому месяцу года `h`,
 * нормировка на среднее 1, усадка к `SI_0` (пул либо единицы) с весом
 * `n_h` — числом лет с наблюдением месяца `h`, снова нормировка и клип в
 * диапазон дескриптора `season_index`.
 *
 * Чистая математика: без DI, Bitrix, Prisma, `Date.now`/`Math.random`.
 */
import { registryDefault, registryRangeOf } from '../params/registry.access';
import { findParam, type AiAnalyticsParamCode } from '../params/registry.const';
import type { ParamRange } from '../params/registry.types';

/** Откуда взялся индекс. */
export const AI_SEASON_INDEX_SOURCES = [
    'default',
    'estimated',
    'pooled',
    'shrunk',
] as const;

export type SeasonIndexSource = (typeof AI_SEASON_INDEX_SOURCES)[number];

/** Месяцев в году — длина индекса. */
export const MONTHS_IN_YEAR = 12;

/** Код реестра индекса. */
export const SEASON_INDEX_CODE = 'season_index' satisfies AiAnalyticsParamCode;

/** Дефолты сезона из реестра. */
export const SEASON_INDEX_DEFAULTS = {
    /** Гейт портального индекса — `minN` дескриптора (36 месяцев). */
    minMonths: findParam(SEASON_INDEX_CODE)?.minN ?? 36,
    /** `kappa_season_years` — κ_s в годах. */
    kappaYears: registryDefault('kappa_season_years'),
} as const;

/**
 * Диапазон множителей: у `season_index` (kind json) поля `range` нет,
 * границы [0,5; 1,5] закреплены описанием дескриптора.
 */
export const SEASON_INDEX_RANGE: ParamRange = registryRangeOf(
    SEASON_INDEX_CODE,
) ?? [0.5, 1.5];

/** Темп месяца на рабочий день. */
export interface MonthlyRatePoint {
    /** Месяц 'YYYY-MM'. */
    readonly monthKey: string;
    readonly ratePerWorkday: number;
}

/** Вход оценки индекса. */
export interface SeasonIndexInput {
    readonly monthlyRates: readonly MonthlyRatePoint[];
    /** Минимум месяцев истории; по умолчанию `minN` дескриптора. */
    readonly minMonths?: number;
    /** κ_s в годах; по умолчанию `kappa_season_years`. */
    readonly kappaYears?: number;
    /** `SI_0` пула (12 множителей); null — пула нет. */
    readonly pooled: readonly number[] | null;
}

/** Результат оценки индекса. */
export interface SeasonIndexResult {
    /** 12 множителей по месяцам года (январь — индекс 0), среднее 1. */
    readonly index: readonly number[];
    readonly source: SeasonIndexSource;
    /** Месяцев истории с конечным темпом. */
    readonly monthsUsed: number;
    /** Различных календарных лет в истории. */
    readonly yearsUsed: number;
    /** `s̃(h)` до усадки (нормированный); единицы, если оценки не было. */
    readonly raw: readonly number[];
    /** `n_h` — число наблюдений коэффициента по месяцам года. */
    readonly observations: readonly number[];
}

const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/;
const HALF_WINDOW = MONTHS_IN_YEAR / 2;

const ones = (): number[] => Array.from({ length: MONTHS_IN_YEAR }, () => 1);

const clip = (value: number, range: ParamRange): number =>
    Math.min(range[1], Math.max(range[0], value));

/** Нормировка на среднее 1; вырожденный вектор — единицы. */
export function normalizeSeasonIndex(values: readonly number[]): number[] {
    const finite = values.map(value =>
        Number.isFinite(value) && value > 0 ? value : 0,
    );
    const mean = finite.reduce((sum, value) => sum + value, 0) / MONTHS_IN_YEAR;
    if (finite.length !== MONTHS_IN_YEAR || mean <= 0) {
        return ones();
    }

    return finite.map(value => value / mean);
}

/** Пул как `SI_0`: 12 чисел → нормированный клипованный вектор, иначе null. */
function pooledIndex(pooled: readonly number[] | null): number[] | null {
    if (pooled === null || pooled.length !== MONTHS_IN_YEAR) {
        return null;
    }

    return normalizeSeasonIndex(pooled).map(value =>
        clip(value, SEASON_INDEX_RANGE),
    );
}

/** Порядковый номер месяца от начала эры: `year·12 + (month − 1)`. */
function ordinalOf(monthKey: string): number | null {
    const match = MONTH_KEY_RE.exec(monthKey);
    if (match === null) {
        return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > MONTHS_IN_YEAR) {
        return null;
    }

    return year * MONTHS_IN_YEAR + (month - 1);
}

/** Темпы по порядковому номеру месяца — дубликаты берут последнее значение. */
function seriesOf(points: readonly MonthlyRatePoint[]): Map<number, number> {
    const series = new Map<number, number>();
    for (const point of points) {
        const ordinal = ordinalOf(point.monthKey);
        if (
            ordinal !== null &&
            Number.isFinite(point.ratePerWorkday) &&
            point.ratePerWorkday >= 0
        ) {
            series.set(ordinal, point.ratePerWorkday);
        }
    }

    return series;
}

/**
 * Центрированная 12-месячная средняя в точке `t`: среднее двух простых
 * средних окон `[t−6; t+5]` и `[t−5; t+6]`; null — окно неполное.
 */
function centeredMovingAverage(
    series: ReadonlyMap<number, number>,
    ordinal: number,
): number | null {
    let sum = 0;
    for (let offset = -HALF_WINDOW; offset <= HALF_WINDOW; offset += 1) {
        const value = series.get(ordinal + offset);
        if (value === undefined) {
            return null;
        }
        const weight = Math.abs(offset) === HALF_WINDOW ? 0.5 : 1;
        sum += weight * value;
    }

    return sum / MONTHS_IN_YEAR;
}

/** Суммы коэффициентов и их число по месяцам года. */
function ratioSums(series: ReadonlyMap<number, number>): {
    readonly sums: number[];
    readonly counts: number[];
} {
    const sums = Array.from({ length: MONTHS_IN_YEAR }, () => 0);
    const counts = Array.from({ length: MONTHS_IN_YEAR }, () => 0);
    const ordinals = [...series.keys()].sort((a, b) => a - b);
    for (const ordinal of ordinals) {
        const average = centeredMovingAverage(series, ordinal);
        const value = series.get(ordinal) ?? 0;
        if (average === null || average <= 0) {
            continue;
        }
        const month = ordinal % MONTHS_IN_YEAR;
        sums[month] += value / average;
        counts[month] += 1;
    }

    return { sums, counts };
}

/**
 * Оценка сезонного индекса. До гейта `minMonths`: пул → `pooled`, иначе
 * единицы (`default`). После гейта: усадка к пулу (`shrunk`) либо к
 * единицам (`estimated`) с весом `n_h/(n_h + κ_s)`.
 */
export function seasonIndex(input: SeasonIndexInput): SeasonIndexResult {
    const minMonths = input.minMonths ?? SEASON_INDEX_DEFAULTS.minMonths;
    const kappaInput = input.kappaYears ?? SEASON_INDEX_DEFAULTS.kappaYears;
    const kappa = Number.isFinite(kappaInput) ? Math.max(0, kappaInput) : 0;
    const series = seriesOf(input.monthlyRates);
    const monthsUsed = series.size;
    const yearsUsed = new Set(
        [...series.keys()].map(ordinal => Math.floor(ordinal / MONTHS_IN_YEAR)),
    ).size;
    const pooled = pooledIndex(input.pooled);
    const base = {
        monthsUsed,
        yearsUsed,
        raw: ones(),
        observations: Array.from({ length: MONTHS_IN_YEAR }, () => 0),
    };
    if (monthsUsed < minMonths) {
        return pooled === null
            ? { ...base, index: ones(), source: 'default' }
            : { ...base, index: pooled, source: 'pooled' };
    }
    const { sums, counts } = ratioSums(series);
    if (counts.every(count => count === 0)) {
        return pooled === null
            ? { ...base, index: ones(), source: 'default' }
            : { ...base, index: pooled, source: 'pooled' };
    }
    const raw = normalizeSeasonIndex(
        sums.map((sum, month) => (counts[month] > 0 ? sum / counts[month] : 1)),
    );
    const prior = pooled ?? ones();
    const shrunk = raw.map((value, month) => {
        const weight = counts[month];
        if (weight + kappa <= 0) {
            return prior[month];
        }

        return (weight * value + kappa * prior[month]) / (weight + kappa);
    });
    const index = normalizeSeasonIndex(shrunk).map(value =>
        clip(value, SEASON_INDEX_RANGE),
    );

    return {
        index,
        source: pooled === null ? 'estimated' : 'shrunk',
        monthsUsed,
        yearsUsed,
        raw,
        observations: counts,
    };
}
