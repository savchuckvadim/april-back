/**
 * Пул распределения лага, логнормального чека и сезона (план §4.8 F_lag,
 * §4.7 SI_0, §4.11 «Ежеквартально»): n-взвешенное среднее F(d) на общей
 * сетке дней, n-взвешенные m и v чека, средний сезонный индекс — каждое
 * только при k ≥ `pool_min_portals` порталов с данными (обезличенность:
 * при одном-двух участниках пул повторял бы чужую таблицу или чек либо
 * восстанавливался бы вычитанием своего вклада).
 *
 * Чистая математика: без DI, Bitrix, Prisma; суммы — в порядке порталов.
 */
import { registryDefault, registryRangeOf } from '../params/registry.access';
import { LAG_CDF_DEFAULTS, type LagCdfPoint } from './lag-cdf';
import type { PoolLagCdf, PoolLognormal, PoolPortalInput } from './pool.types';

/** Дефолты пула лага и сезона — из реестра. */
export const POOL_LAG_DEFAULTS = {
    /**
     * Верх сетки дней — потолок диапазона `lag_window_sale_days` (окно
     * атрибуции у портала гибридное и может быть длиннее дефолта): общая
     * сетка обязана накрыть окно каждого портала, иначе F(∞) пула < 1.
     */
    gridDays:
        registryRangeOf('lag_window_sale_days')?.[1] ??
        LAG_CDF_DEFAULTS.windowDays,
    /** `pool_min_portals` — минимум порталов с данными для F(d) и чека пула. */
    minPortals: registryDefault('pool_min_portals'),
    /** `pool_min_portals` — минимум порталов для сезона пула. */
    minPortalsSeason: registryDefault('pool_min_portals'),
} as const;

/** Параметры F(d) пула. */
export interface PoolLagCdfOptions {
    /** Минимум порталов с таблицей (n > 0); меньше — null. */
    readonly minPortals?: number;
    /** Верх общей сетки дней. */
    readonly gridDays?: number;
}

/** Гейт обезличенности: участников с данными не меньше minPortals (и ≥ 1). */
const enoughPortals = (count: number, minPortals: number): boolean =>
    count > 0 && count >= Math.max(1, minPortals);

/** Месяцев в сезонном индексе. */
export const SEASON_INDEX_LENGTH = 12;

const HALF = 0.5;

/** Клип в [0; 1]; нечисловое значение таблицы портала считается нулём. */
const clamp01 = (value: number): number =>
    Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** Хвост постоянных точек после последнего роста отбрасывается без потерь. */
function trimPlateau(points: readonly LagCdfPoint[]): LagCdfPoint[] {
    let last = 0;
    for (let index = 1; index < points.length; index += 1) {
        if (points[index].value > points[index - 1].value) {
            last = index;
        }
    }

    return points.slice(0, last + 1);
}

/** Линейная интерполяция по целочисленной сетке; за сеткой — крайние значения. */
function interpolate(points: readonly LagCdfPoint[], days: number): number {
    if (!Number.isFinite(days) || days <= 0 || points.length === 0) {
        return 0;
    }
    const last = points[points.length - 1];
    if (days >= last.days) {
        return last.value;
    }
    const low = Math.floor(days);
    const high = Math.ceil(days);
    if (low === high) {
        return points[low].value;
    }

    return (
        points[low].value +
        (days - low) * (points[high].value - points[low].value)
    );
}

/**
 * F(d) пула: на целочисленной сетке дней 0…gridDays (объединение сеток
 * порталов — все таблицы портала целодневные) берётся Σ n_i F_i(d)/Σ n_i,
 * затем F(0) = 0, бегущий максимум и клип [0; 1]; хвост-плато отбрасывается,
 * за последней точкой таблица постоянна. Таблицы порталов в cure-форме
 * (F = 1 к своему окну) дают F(∞) = 1 и у пула. Порталы без таблицы или с
 * n ≤ 0 (прайор-экспонента) не участвуют; таких порталов меньше
 * minPortals (по умолчанию `pool_min_portals`) → null.
 */
export function poolLagCdf(
    portals: readonly PoolPortalInput[],
    options: PoolLagCdfOptions = {},
): PoolLagCdf | null {
    const minPortals = options.minPortals ?? POOL_LAG_DEFAULTS.minPortals;
    const gridDays = options.gridDays ?? POOL_LAG_DEFAULTS.gridDays;
    const usable = portals.filter(
        portal => portal.lagCdf !== null && portal.lagCdf.n > 0,
    );
    let sumN = 0;
    for (const portal of usable) {
        sumN += portal.lagCdf?.n ?? 0;
    }
    if (!enoughPortals(usable.length, minPortals) || !(sumN > 0)) {
        return null;
    }
    const days = Math.max(1, Math.floor(gridDays));
    const grid: LagCdfPoint[] = [];
    let running = 0;
    for (let day = 0; day <= days; day += 1) {
        let weighted = 0;
        for (const portal of usable) {
            const cdf = portal.lagCdf;
            if (cdf !== null) {
                weighted += cdf.n * clamp01(cdf.at(day));
            }
        }
        const value = day === 0 ? 0 : clamp01(weighted / sumN);
        running = Math.max(running, value);
        grid.push({ days: day, value: running });
    }
    const points = trimPlateau(grid);
    const median = points.find(point => point.value >= HALF)?.days ?? null;

    return {
        kind: 'table',
        medianDays: median,
        n: sumN,
        points,
        at: (value: number) => interpolate(points, value),
    };
}

/**
 * Логнормальный чек пула: n-взвешенные m и v; пригодных порталов меньше
 * minPortals (по умолчанию `pool_min_portals`) → null.
 */
export function poolLognormal(
    portals: readonly PoolPortalInput[],
    minPortals: number = POOL_LAG_DEFAULTS.minPortals,
): PoolLognormal | null {
    let usable = 0;
    let sumN = 0;
    let sumM = 0;
    let sumV = 0;
    for (const portal of portals) {
        const check = portal.lognormal;
        if (
            check === null ||
            !(check.n > 0) ||
            !Number.isFinite(check.m) ||
            !Number.isFinite(check.v)
        ) {
            continue;
        }
        usable += 1;
        sumN += check.n;
        sumM += check.n * check.m;
        sumV += check.n * check.v;
    }
    if (!enoughPortals(usable, minPortals) || !(sumN > 0)) {
        return null;
    }

    return { m: sumM / sumN, v: sumV / sumN, n: sumN };
}

/** Индекс пригоден: ровно 12 конечных положительных множителей. */
export const isUsableSeasonIndex = (
    index: readonly number[] | null,
): index is readonly number[] =>
    index !== null &&
    index.length === SEASON_INDEX_LENGTH &&
    index.every(value => Number.isFinite(value) && value > 0);

/**
 * SI_0 пула (план §4.7): среднее по порталам с оценённым индексом при
 * k ≥ minPortals; иначе null — «сезон не оценён», единицы подставляет
 * вызывающий код.
 */
export function poolSeasonIndex(
    portals: readonly PoolPortalInput[],
    minPortals: number = POOL_LAG_DEFAULTS.minPortalsSeason,
): readonly number[] | null {
    const indexes = portals
        .map(portal => portal.seasonIndex)
        .filter(isUsableSeasonIndex);
    if (!enoughPortals(indexes.length, minPortals)) {
        return null;
    }
    const result: number[] = [];
    for (let month = 0; month < SEASON_INDEX_LENGTH; month += 1) {
        let sum = 0;
        for (const index of indexes) {
            sum += index[month];
        }
        result.push(sum / indexes.length);
    }

    return result;
}
