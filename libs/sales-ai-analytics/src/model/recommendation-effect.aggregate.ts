/**
 * Агрегаты оценки эффекта советов (план §10 L5): доли с интервалом
 * Уилсона и сравнение рёбер «после − до» по Ньюкомбу. Вынесено из
 * `recommendation-effect.ts` по лимиту 300 строк.
 *
 * Суммы идут в фиксированном порядке: советы сортируются по `managerId`,
 * `monthKey`, `key`, окна «до/после» — по ключу окна, рёбра — по коду.
 * Чистые функции.
 */
import { newcombeDifference } from './edge-rate';
import type { OutcomeSample } from './lever.types';
import type {
    EdgeBeforeAfter,
    EdgeSamples,
    IssuedRecommendation,
    ShareWithInterval,
} from './recommendation-effect.types';
import { wilsonInterval } from './wilson';

/** Ключ сортировки советов — порядок счётчиков не зависит от порядка входа. */
const compareIssued = (
    a: IssuedRecommendation,
    b: IssuedRecommendation,
): number =>
    a.managerId.localeCompare(b.managerId) ||
    a.monthKey.localeCompare(b.monthKey) ||
    a.key.localeCompare(b.key);

/** Копия списка советов в фиксированном порядке. */
export const sortIssued = (
    issued: readonly IssuedRecommendation[],
): IssuedRecommendation[] => [...issued].sort(compareIssued);

/** Совет с закрытым окном «после». */
export const hasClosedWindow = (
    item: IssuedRecommendation,
): item is IssuedRecommendation & { readonly after: EdgeSamples } =>
    item.after !== null;

/** Неотрицательное конечное число выборки; иное — 0. */
const nonNegative = (value: number): number =>
    Number.isFinite(value) && value > 0 ? value : 0;

/** Выборка с обрезкой `s ≤ n` и неотрицательными числами. */
const normalizeSample = (sample: OutcomeSample): OutcomeSample => {
    const n = nonNegative(sample.n);

    return { s: Math.min(nonNegative(sample.s), n), n };
};

/**
 * Доля `hits/n` с интервалом Уилсона. Ниже `minN` (`n_min_none`) ни
 * значения, ни интервала наружу нет — только знаменатель.
 */
export function shareWithInterval(
    hits: number,
    n: number,
    minN: number,
    z: number,
): ShareWithInterval {
    if (n < minN || n <= 0) {
        return { value: null, ci90: null, n };
    }
    const bounded = Math.min(Math.max(hits, 0), n);

    return { value: bounded / n, ci90: wilsonInterval(bounded, n, z), n };
}

interface EdgeAccumulator {
    beforeS: number;
    beforeN: number;
    afterS: number;
    afterN: number;
    count: number;
}

const emptyAccumulator = (): EdgeAccumulator => ({
    beforeS: 0,
    beforeN: 0,
    afterS: 0,
    afterN: 0,
    count: 0,
});

/** Коды рёбер, присутствующих в обоих окнах совета, по алфавиту. */
const commonEdges = (before: EdgeSamples, after: EdgeSamples): string[] =>
    Object.keys(before)
        .filter(edge => Object.prototype.hasOwnProperty.call(after, edge))
        .sort();

/**
 * Разность долей и интервал Ньюкомба «после − до». Знаменатель «до» или
 * «после» меньше `minN` (`n_min_none`) — разности нет: ни одного числа
 * при малой выборке.
 */
const edgeResult = (
    edge: string,
    acc: EdgeAccumulator,
    minN: number,
): EdgeBeforeAfter => {
    const before: OutcomeSample = { s: acc.beforeS, n: acc.beforeN };
    const after: OutcomeSample = { s: acc.afterS, n: acc.afterN };
    const canCompare =
        before.n > 0 && after.n > 0 && before.n >= minN && after.n >= minN;

    return {
        edge,
        before,
        after,
        diff: canCompare ? after.s / after.n - before.s / before.n : null,
        ci90: null,
        n: acc.count,
    };
};

/** Разделитель частей ключа окна — не встречается в кодах рёбер и месяцев. */
const WINDOW_KEY_SEPARATOR = '\u0000';

/** Выборки одного окна менеджер × месяц × ребро. */
interface WindowSamples {
    readonly edge: string;
    readonly before: OutcomeSample;
    readonly after: OutcomeSample;
}

/** Ключ окна менеджер × месяц выдачи × ребро. */
const windowKeyOf = (item: IssuedRecommendation, edge: string): string =>
    [item.managerId, item.monthKey, edge].join(WINDOW_KEY_SEPARATOR);

/**
 * Представитель окна при нескольких советах в нём: большие знаменатели,
 * затем большие числители — правило не зависит от порядка входа; при
 * одинаковых выборках (реальный случай) выбор безразличен.
 */
const preferWindow = (
    current: WindowSamples | undefined,
    next: WindowSamples,
): WindowSamples => {
    if (current === undefined) {
        return next;
    }
    const order =
        next.before.n - current.before.n ||
        next.after.n - current.after.n ||
        next.before.s - current.before.s ||
        next.after.s - current.after.s;

    return order > 0 ? next : current;
};

/** Окна по ключу: одно окно — одна пара выборок, сколько бы советов в нём ни было. */
function collectWindows(
    issued: readonly IssuedRecommendation[],
): Map<string, WindowSamples> {
    const windows = new Map<string, WindowSamples>();
    for (const item of issued) {
        if (!hasClosedWindow(item)) {
            continue;
        }
        for (const edge of commonEdges(item.before, item.after)) {
            const key = windowKeyOf(item, edge);
            windows.set(
                key,
                preferWindow(windows.get(key), {
                    edge,
                    before: normalizeSample(item.before[edge]),
                    after: normalizeSample(item.after[edge]),
                }),
            );
        }
    }

    return windows;
}

/**
 * «После − до» по рёбрам: `s` и `n` суммируются по окнам с закрытым
 * «после», у которых ребро есть в обоих окнах; интервал разности — Ньюкомб
 * на суммарных выборках. Рёбра — по коду в алфавитном порядке.
 *
 * Единица наблюдения — окно менеджер × месяц выдачи: несколько советов
 * одному менеджеру в один месяц смотрят на одни и те же рёбра «до» и
 * «после», поэтому такое окно входит в суммы один раз, иначе `n`
 * завышается и интервал сужается. Суммы идут в порядке ключей окон, так
 * что результат не зависит от порядка входа.
 *
 * Суммарный знаменатель «до» или «после» ниже `minN` (`n_min_none`) —
 * `diff` и `ci90` null: выборки отдаются, разность — нет.
 */
export function aggregateBeforeAfter(
    issued: readonly IssuedRecommendation[],
    z: number,
    minN: number,
): EdgeBeforeAfter[] {
    const windows = collectWindows(issued);
    const byEdge = new Map<string, EdgeAccumulator>();
    for (const key of [...windows.keys()].sort()) {
        const window = windows.get(key);
        if (window === undefined) {
            continue;
        }
        const acc = byEdge.get(window.edge) ?? emptyAccumulator();
        acc.beforeS += window.before.s;
        acc.beforeN += window.before.n;
        acc.afterS += window.after.s;
        acc.afterN += window.after.n;
        acc.count += 1;
        byEdge.set(window.edge, acc);
    }

    return [...byEdge.keys()].sort().map(edge => {
        const base = edgeResult(
            edge,
            byEdge.get(edge) ?? emptyAccumulator(),
            minN,
        );
        const ci90 =
            base.diff === null
                ? null
                : newcombeDifference(
                      { successes: base.after.s, exposure: base.after.n },
                      { successes: base.before.s, exposure: base.before.n },
                      z,
                  );

        return { ...base, ci90 };
    });
}

/** Счётчики по списку советов. */
export interface IssuedCounts {
    readonly issued: number;
    readonly completedWindows: number;
    readonly done: number;
    readonly disagree: number;
}

/** Выдано / закрытых окон / выполнено / несогласий. */
export function countIssued(
    issued: readonly IssuedRecommendation[],
): IssuedCounts {
    let completedWindows = 0;
    let done = 0;
    let disagree = 0;
    for (const item of issued) {
        if (hasClosedWindow(item)) {
            completedWindows += 1;
        }
        if (item.done) {
            done += 1;
        }
        if (item.disagree) {
            disagree += 1;
        }
    }

    return { issued: issued.length, completedWindows, done, disagree };
}
