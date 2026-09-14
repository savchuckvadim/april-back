/**
 * Rolling-origin бэктест норм — гейт L2 (план Фазы 2 §6, поток
 * `p2-model-norms`).
 *
 * Для каждой точки отсчёта t нормы считаются по месяцам ≤ t тем же
 * `leaveOneOutNorm`, что и в конвейере, и делят менеджеров на «ниже нормы»
 * и «не ниже». Затем месяц t+1 делится тем же правилом по своим данным —
 * это фактическое разбиение. Нормы предсказывают, если среди предсказанных
 * «ниже нормы» доля фактически оказавшихся ниже в t+1 больше, чем среди
 * остальных: нижняя граница 90 %-интервала разности долей (Ньюкомб) > 0 →
 * `pass`, иначе `fail`. Пары «менеджер × точка отсчёта» копятся по всем
 * точкам: на 12 месяцах × 6 менеджеров одна точка даёт лишь 6 пар.
 *
 * Гейт мягкий: `fail` — не баг кода, а невыполнение гейта L2 на данных;
 * `insufficient` — данных для проверки нет (мало месяцев или одна из
 * групп меньше минимума), и это не провал.
 *
 * Чистые функции: без DI, Bitrix и `new Date()`.
 */
import { GapSample, newcombeDifference } from './edge-rate';
import { NormCell, leaveOneOutNorm } from './norms-hierarchy';

/** Менеджер-ячейка нормы за один месяц. */
export interface NormsBacktestCell extends NormCell {
    /** Месяц ячейки 'YYYY-MM'. */
    monthKey: string;
}

export interface NormsBacktestOptions {
    /** Минимум месяцев обучения до первой точки отсчёта; по умолчанию 3. */
    minTrainMonths?: number;
    /** Минимум пар «менеджер × точка отсчёта» в каждой группе; по умолчанию 5. */
    minGroupPairs?: number;
    /** Минимум менеджеров полосы для слоя полосы — как в leaveOneOutNorm. */
    minBandManagers?: number;
    /** Квантиль интервала; по умолчанию z90 = 1,645. */
    z?: number;
}

export type NormsBacktestStatus = 'pass' | 'fail' | 'insufficient';
export type NormsBacktestReason = 'not-enough-months' | 'group-too-small';

/** Группа предсказанного разбиения и её фактический исход в t+1. */
export interface NormsBacktestGroup {
    /** Пар «менеджер × точка отсчёта» в группе. */
    pairs: number;
    /** Из них фактически ниже нормы в месяце t+1. */
    below: number;
}

export interface NormsBacktestResult {
    status: NormsBacktestStatus;
    /** Почему данных недостаточно; null — проверка проведена. */
    reason: NormsBacktestReason | null;
    /** Точки отсчёта t ('YYYY-MM'): нормы из месяцев ≤ t проверены на t+1. */
    origins: string[];
    /** Предсказаны ниже нормы по данным ≤ t. */
    predictedBelow: NormsBacktestGroup;
    /** Предсказаны не ниже нормы по данным ≤ t. */
    predictedAtOrAbove: NormsBacktestGroup;
    /** Разность долей «ниже нормы в t+1» между группами; null — не из чего. */
    delta: number | null;
    /** 90 %-интервал разности по Ньюкомбу; null — одна из групп пуста. */
    ci90: [number, number] | null;
}

/** Дефолты бэктеста (гейт L2 плана §6: ≥ 3 месяцев истории). */
export const NORMS_BACKTEST_DEFAULTS = {
    minTrainMonths: 3,
    minGroupPairs: 5,
} as const;

const emptyGroup = (): NormsBacktestGroup => ({ pairs: 0, below: 0 });

const toSample = (group: NormsBacktestGroup): GapSample => ({
    successes: group.below,
    exposure: group.pairs,
});

/**
 * Ячейки менеджеров за набор месяцев: суммы s и n без месяцев с
 * excludeFromNorms, полоса стажа — по последнему месяцу менеджера.
 */
function aggregateCells(
    cells: readonly NormsBacktestCell[],
    months: ReadonlySet<string>,
): NormCell[] {
    const byManager = new Map<string, NormCell>();
    const ordered = [...cells]
        .filter(
            cell => months.has(cell.monthKey) && cell.excludeFromNorms !== true,
        )
        .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    for (const cell of ordered) {
        const current = byManager.get(cell.managerId);
        byManager.set(cell.managerId, {
            managerId: cell.managerId,
            tenureBand: cell.tenureBand ?? current?.tenureBand ?? null,
            s: (current?.s ?? 0) + Math.max(0, cell.s),
            n: (current?.n ?? 0) + Math.max(0, cell.n),
        });
    }
    return [...byManager.values()].filter(cell => cell.n > 0);
}

/**
 * Менеджер ниже leave-one-out нормы своего слоя по ячейкам окна;
 * null — нормы нет (пул без знаменателя), сравнивать не с чем.
 */
function isBelowNorm(
    cell: NormCell,
    cells: readonly NormCell[],
    minBandManagers: number | undefined,
): boolean | null {
    const norm = leaveOneOutNorm({
        cells,
        managerId: cell.managerId,
        tenureBand: cell.tenureBand,
        minBandManagers,
    });
    return norm.n > 0 ? cell.s / cell.n < norm.value : null;
}

function insufficient(
    reason: NormsBacktestReason,
    partial: Partial<NormsBacktestResult> = {},
): NormsBacktestResult {
    return {
        status: 'insufficient',
        reason,
        origins: [],
        predictedBelow: emptyGroup(),
        predictedAtOrAbove: emptyGroup(),
        delta: null,
        ci90: null,
        ...partial,
    };
}

/**
 * Rolling-origin бэктест норм: нормы из месяцев ≤ t против месяца t+1
 * по всем точкам отсчёта после minTrainMonths месяцев обучения.
 */
export function backtestNorms(
    cells: readonly NormsBacktestCell[],
    options: NormsBacktestOptions = {},
): NormsBacktestResult {
    const minTrain =
        options.minTrainMonths ?? NORMS_BACKTEST_DEFAULTS.minTrainMonths;
    const minPairs =
        options.minGroupPairs ?? NORMS_BACKTEST_DEFAULTS.minGroupPairs;
    const months = [...new Set(cells.map(cell => cell.monthKey))].sort();
    if (months.length < minTrain + 1) {
        return insufficient('not-enough-months');
    }
    const predictedBelow = emptyGroup();
    const predictedAtOrAbove = emptyGroup();
    const origins: string[] = [];
    for (let index = minTrain - 1; index < months.length - 1; index += 1) {
        const train = aggregateCells(
            cells,
            new Set(months.slice(0, index + 1)),
        );
        const test = aggregateCells(cells, new Set([months[index + 1]]));
        origins.push(months[index]);
        for (const subject of test) {
            const trained = train.find(
                cell => cell.managerId === subject.managerId,
            );
            if (trained === undefined) continue;
            const predicted = isBelowNorm(
                trained,
                train,
                options.minBandManagers,
            );
            const actual = isBelowNorm(subject, test, options.minBandManagers);
            if (predicted === null || actual === null) continue;
            const group = predicted ? predictedBelow : predictedAtOrAbove;
            group.pairs += 1;
            group.below += actual ? 1 : 0;
        }
    }
    const ci90 = newcombeDifference(
        toSample(predictedBelow),
        toSample(predictedAtOrAbove),
        options.z,
    );
    const delta =
        predictedBelow.pairs > 0 && predictedAtOrAbove.pairs > 0
            ? predictedBelow.below / predictedBelow.pairs -
              predictedAtOrAbove.below / predictedAtOrAbove.pairs
            : null;
    const partial = {
        origins,
        predictedBelow,
        predictedAtOrAbove,
        delta,
        ci90,
    };
    if (
        predictedBelow.pairs < minPairs ||
        predictedAtOrAbove.pairs < minPairs
    ) {
        return insufficient('group-too-small', partial);
    }
    return {
        status: ci90 !== null && ci90[0] > 0 ? 'pass' : 'fail',
        reason: null,
        ...partial,
    };
}
