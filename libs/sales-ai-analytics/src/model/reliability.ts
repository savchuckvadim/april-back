import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';

/**
 * Надёжность оценок LLM-оценщика (план §4.3, §4.11).
 * - sigmaLlm — шум оценщика до измерения test-retest (configured);
 * - iccMin — гейт dq.score_icc_min;
 * - retestBudgetCalls — квота повторных прогонов при смене промпта/рубрики;
 * - deltaPracticalScore — практический порог 1 балл для оценок (§4.2);
 * - notMeasuredNote — пометка «надёжность не измерена» для UI.
 */
export const RELIABILITY_DEFAULTS = {
    sigmaLlm: 1.2,
    iccMin: 0.7,
    retestBudgetCalls: 300,
    deltaPracticalScore: 1,
    notMeasuredNote: 'reliability-not-measured',
} as const;

/** Откуда взят σ_llm: измерен test-retest'ом или дефолт реестра. */
export type ReliabilitySource = 'measured' | 'configured';

export interface SigmaLlm {
    value: number;
    source: ReliabilitySource;
    /** 'reliability-not-measured' — величина эффекта качества скрывается. */
    note?: typeof RELIABILITY_DEFAULTS.notMeasuredNote;
}

/** Пара повторных прогонов одного разбора (test-retest). */
export interface RetestPair {
    first: number;
    second: number;
}

/** Оценки одного объекта разными прогонами/оценщиками (для ICC(2,1)). */
export interface IccSubject {
    key: string;
    ratings: readonly number[];
}

/** Измеренный σ_llm или дефолт 1,2 с пометкой «надёжность не измерена». */
export function resolveSigmaLlm(measured?: number | null): SigmaLlm {
    if (typeof measured === 'number' && Number.isFinite(measured)) {
        return { value: Math.max(0, measured), source: 'measured' };
    }
    return {
        value: RELIABILITY_DEFAULTS.sigmaLlm,
        source: 'configured',
        note: RELIABILITY_DEFAULTS.notMeasuredNote,
    };
}

/**
 * σ_llm из test-retest: σ = √(½·mean((S⁽¹⁾ − S⁽²⁾)²)) — половина, потому что
 * разность двух независимых прогонов несёт двойную дисперсию оценщика.
 * Пустой набор → null (надёжность не измерена).
 */
export function sigmaFromRetest(pairs: readonly RetestPair[]): number | null {
    const squares = pairs
        .filter(
            pair => Number.isFinite(pair.first) && Number.isFinite(pair.second),
        )
        .map(pair => (pair.first - pair.second) ** 2);
    if (squares.length === 0) {
        return null;
    }
    const mean =
        squares.reduce((acc, value) => acc + value, 0) / squares.length;
    return Math.sqrt(mean / 2);
}

const meanOf = (values: readonly number[]): number =>
    values.reduce((acc, value) => acc + value, 0) / values.length;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * ICC(2,1) — двухфакторная случайная модель, единичная оценка, абсолютное
 * согласие: (MSR − MSE)/(MSR + (k−1)·MSE + k·(MSC − MSE)/n), где n — число
 * объектов, k — число прогонов. Нужна полная матрица (у всех объектов
 * одинаковое k ≥ 2, объектов ≥ 2), иначе null. Отрицательная оценка (между
 * объектами сигнала нет) обрезается до 0.
 */
export function icc21(groups: readonly IccSubject[]): number | null {
    const n = groups.length;
    const k = groups[0]?.ratings.length ?? 0;
    const balanced =
        n >= 2 &&
        k >= 2 &&
        groups.every(
            group =>
                group.ratings.length === k &&
                group.ratings.every(Number.isFinite),
        );
    if (!balanced) {
        return null;
    }
    const grand = meanOf(groups.flatMap(group => [...group.ratings]));
    const rowMeans = groups.map(group => meanOf(group.ratings));
    const colMeans = Array.from({ length: k }, (_, index) =>
        meanOf(groups.map(group => group.ratings[index])),
    );
    const ssRows =
        k * rowMeans.reduce((acc, value) => acc + (value - grand) ** 2, 0);
    const ssCols =
        n * colMeans.reduce((acc, value) => acc + (value - grand) ** 2, 0);
    const ssTotal = groups.reduce(
        (acc, group) =>
            acc + group.ratings.reduce((sum, x) => sum + (x - grand) ** 2, 0),
        0,
    );
    const msRows = ssRows / (n - 1);
    const msCols = ssCols / (k - 1);
    const msError = (ssTotal - ssRows - ssCols) / ((n - 1) * (k - 1));
    const denominator =
        msRows + (k - 1) * msError + (k * (msCols - msError)) / n;
    return denominator > 0 ? clamp01((msRows - msError) / denominator) : null;
}

/**
 * Спирмен–Браун: надёжность среднего из n оценок r_n = n·ICC/(1 + (n−1)·ICC).
 * Нужна для поправки β по надёжности предиктора-среднего (§4.4).
 */
export function spearmanBrown(icc: number, n: number): number {
    if (!Number.isFinite(icc) || icc <= 0 || !(n > 0)) {
        return 0;
    }
    return clamp01((n * icc) / (1 + (n - 1) * icc));
}

export interface SeOfMeanInput {
    /** σ навыка (разброс истинного качества звонков менеджера). */
    sigmaSkill: number;
    /** σ оценщика; по умолчанию дефолт 1,2 (configured). */
    sigmaLlm?: number;
    n: number;
}

/**
 * SE(S̄) = √((σ²_skill + σ²_llm)/n). Числа плана: σ_skill = σ_llm = 1,2,
 * n = 20 → 0,38. n ≤ 0 → null.
 */
export function seOfMean(input: SeOfMeanInput): number | null {
    const sigmaLlm = input.sigmaLlm ?? RELIABILITY_DEFAULTS.sigmaLlm;
    if (!(input.n > 0) || !Number.isFinite(input.sigmaSkill)) {
        return null;
    }
    return Math.sqrt((input.sigmaSkill ** 2 + sigmaLlm ** 2) / input.n);
}

/** Группа менеджера относительно нормы; unknown — n ниже порога показа. */
export type ManagerScoreGroup = 'above' | 'level' | 'below' | 'unknown';

export interface ManagerScoreInput {
    managerId: string;
    /** S̄ менеджера (шкала 1–10). */
    mean: number;
    n: number;
}

export interface GroupManagersInput {
    managers: readonly ManagerScoreInput[];
    /** Норма сравнения μ (LOO-норма полосы/портала). */
    reference: number;
    sigmaSkill: number;
    sigmaLlm?: number;
    /** Квантиль интервала; по умолчанию z90 = 1,645. */
    z?: number;
    /** Практический порог; по умолчанию 1 балл. */
    deltaPractical?: number;
}

export interface ManagerGrouped {
    managerId: string;
    group: ManagerScoreGroup;
    mean: number;
    n: number;
    se: number | null;
    ci90: [number, number] | null;
    /** Место в порядке допустимо только при n ≥ 50 (n_min_rating). */
    orderAllowed: boolean;
}

export interface ManagerGroupsResult {
    reference: number;
    sigmaLlm: SigmaLlm;
    /** Менеджеры в порядке managerId — это НЕ рейтинг и не места. */
    groups: ManagerGrouped[];
}

function groupOf(
    mean: number,
    n: number,
    ci90: [number, number] | null,
    reference: number,
    deltaPractical: number,
): ManagerScoreGroup {
    if (n < AI_ANALYTICS_THRESHOLDS.scoreNone || ci90 === null) {
        return 'unknown';
    }
    if (ci90[0] > reference && mean - reference >= deltaPractical) {
        return 'above';
    }
    if (ci90[1] < reference && reference - mean >= deltaPractical) {
        return 'below';
    }
    return 'level';
}

/**
 * Группы «выше / на уровне / ниже» нормы по 90 %-интервалам и практическому
 * порогу (§4.3): рейтинга людей нет — результат отсортирован по managerId,
 * никаких мест по значению. Порядок между двумя менеджерами разрешает
 * отдельная проверка canOrderPair.
 */
export function groupManagers(input: GroupManagersInput): ManagerGroupsResult {
    const sigmaLlm = resolveSigmaLlm(input.sigmaLlm ?? null);
    const z = input.z ?? AI_ANALYTICS_THRESHOLDS.z90;
    const deltaPractical =
        input.deltaPractical ?? RELIABILITY_DEFAULTS.deltaPracticalScore;
    const groups = [...input.managers]
        .sort((a, b) => a.managerId.localeCompare(b.managerId))
        .map(manager => {
            const se = seOfMean({
                sigmaSkill: input.sigmaSkill,
                sigmaLlm: sigmaLlm.value,
                n: manager.n,
            });
            const ci90: [number, number] | null =
                se === null
                    ? null
                    : [manager.mean - z * se, manager.mean + z * se];
            return {
                managerId: manager.managerId,
                group: groupOf(
                    manager.mean,
                    manager.n,
                    ci90,
                    input.reference,
                    deltaPractical,
                ),
                mean: manager.mean,
                n: manager.n,
                se,
                ci90,
                orderAllowed: manager.n >= AI_ANALYTICS_THRESHOLDS.ratingMin,
            };
        });
    return { reference: input.reference, sigmaLlm, groups };
}

export interface OrderVerdict {
    separated: boolean;
    delta: number;
    /** SE разности √(SE_a² + SE_b²); null — SE не определён. */
    seDiff: number | null;
    reason?: 'few-data' | 'within-noise';
}

/**
 * Можно ли поставить двух менеджеров в порядке: только при n ≥ 50 у обоих
 * (n_min_rating) и |Δ| > 2·SE разности. Числа плана: σ_skill = σ_llm = 1,2,
 * n = 20 → SE(S̄) = 0,38, SE разности = 0,54 → при |Δ| = 0,9 не разделяются.
 */
export function canOrderPair(
    a: ManagerGrouped,
    b: ManagerGrouped,
): OrderVerdict {
    const delta = Math.abs(a.mean - b.mean);
    const seDiff =
        a.se === null || b.se === null
            ? null
            : Math.sqrt(a.se ** 2 + b.se ** 2);
    if (!a.orderAllowed || !b.orderAllowed || seDiff === null) {
        return { separated: false, delta, seDiff, reason: 'few-data' };
    }
    if (delta <= 2 * seDiff) {
        return { separated: false, delta, seDiff, reason: 'within-noise' };
    }
    return { separated: true, delta, seDiff };
}
