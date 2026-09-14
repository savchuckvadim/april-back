import { KAPPA_DEFAULTS, layerKappa } from './kappa';
import { ShrinkPrior } from './shrink';

/**
 * Слой, с которого взята норма μ (план §4.2): полоса стажа, портал или
 * глобальный дефолт из дампа. До появления пула kappa_portal_to_global = 0,
 * поэтому верхний слой одно-портального режима — сам портал (LOO).
 */
export type NormLayer = 'tenure' | 'portal' | 'global';

/** Менеджер-ячейка нормы: переходы s из знаменателя n за окно оценки. */
export interface NormCell {
    managerId: string;
    /** Полоса стажа tenure_bands (0–6 / 6–18 / 18+ мес.), не уровень РОПа. */
    tenureBand?: string | null;
    s: number;
    n: number;
    /** Экспозиция помечена excludeFromNorms (proxy или D < 8 дней). */
    excludeFromNorms?: boolean;
}

/** Глобальный дефолт μ_0k и его сила κ (0 — до появления пула). */
export interface NormGlobalPrior {
    mu: number;
    kappa: number;
}

/**
 * Стартовая усадка нового портала (план §4.2): пока сравнимой истории
 * ≤ untilMonths месяцев, дефолт дампа μ_0k подмешивается силой
 * κ_boot = kappa_boot_ratio·median(ñ) и вытесняется собственными данными.
 */
export interface NormBootInput {
    /** Месяцев сравнимой истории портала. */
    months: number;
    /** kappa_boot_ratio; по умолчанию 0,2. */
    ratio?: number;
    /** Портал считается новым, пока месяцев ≤ этого числа; по умолчанию 3. */
    untilMonths?: number;
}

export interface NormHierarchyInput {
    /** Все менеджер-ячейки портала за окно оценки. */
    cells: readonly NormCell[];
    /** Менеджер, для которого считается норма: исключается из пула. */
    managerId: string;
    /** Полоса стажа этого менеджера; null/undefined — сразу слой портала. */
    tenureBand?: string | null;
    /** Минимум менеджеров полосы для собственного слоя, по умолчанию 3. */
    minBandManagers?: number;
    /** Глобальный слой; null — kappa_portal_to_global = 0. */
    global?: NormGlobalPrior | null;
    /** Стартовая усадка нового портала; без неё κ_boot не действует. */
    boot?: NormBootInput | null;
}

export interface NormResult {
    /** μ слоя без менеджера m. */
    value: number;
    layer: NormLayer;
    /** Знаменатель слоя (без глобального прайора). */
    n: number;
    /** Доля данных слоя: n/(n + κ_global); при κ_global = 0 → 1. */
    w: number;
    /** Менеджер, исключённый из пула (leave-one-out). */
    excludedManagerId: string;
    /**
     * μ_pk портала без менеджера m — вторая норма, когда применён слой
     * полосы; null — норма и так портальная (или глобальная).
     */
    portalValue: number | null;
    /** Норма полосы занижена составом: μ_lk < 0,7·μ_pk (levelNormUnderstated). */
    bandUnderstated: boolean;
    /** Применённая сила глобального прайора: κ_global либо κ_boot нового портала. */
    globalKappa: number;
    /** κ_boot нового портала определил силу глобального прайора. */
    boot: boolean;
}

/** Флаги нормы слоя, которые витрина показывает с объяснением. */
export const NORM_FLAGS = ['level_norm_understated'] as const;
export type NormFlag = (typeof NORM_FLAGS)[number];

/** Объяснение флага нормы для витрины и брифа (без слова «значимо»). */
export const NORM_FLAG_EXPLANATIONS: Record<NormFlag, string> = {
    level_norm_understated:
        'Норма полосы стажа заметно ниже нормы портала: полоса набрана ' +
        'составом, а не мастерством, и сравнивать менеджера только с ней ' +
        'нечестно — показываются оба разрыва, к норме полосы и к норме портала.',
};

/** Дефолты иерархии норм (план §4.2). */
export const NORM_HIERARCHY_DEFAULTS = {
    minBandManagers: 3,
    /** kappa_portal_to_global: до пула 0 — глобальный слой не подмешивается. */
    portalToGlobal: KAPPA_DEFAULTS.portalToGlobal,
    /** kappa_boot_ratio: доля медианной экспозиции в стартовой усадке. */
    bootRatio: 0.2,
    /** Новый портал — пока сравнимой истории ≤ 3 месяцев. */
    bootMonths: 3,
    /** Полоса занижена составом, если μ_lk ниже этой доли от μ_pk. */
    levelUnderstatedRatio: 0.7,
} as const;

interface NormPool {
    s: number;
    n: number;
    managers: number;
}

const emptyPool = (): NormPool => ({ s: 0, n: 0, managers: 0 });

function poolOf(cells: readonly NormCell[]): NormPool {
    return cells.reduce<NormPool>(
        (acc, cell) => ({
            s: acc.s + Math.max(0, cell.s),
            n: acc.n + Math.max(0, cell.n),
            managers: acc.managers + 1,
        }),
        emptyPool(),
    );
}

/**
 * Норма полосы (уровня) занижена составом (план §4.2): μ_lk < 0,7·μ_pk.
 * Нулевая или отрицательная норма портала — сравнивать не с чем, флага нет.
 */
export function levelNormUnderstated(
    muLevel: number,
    muPortal: number,
    ratio: number = NORM_HIERARCHY_DEFAULTS.levelUnderstatedRatio,
): boolean {
    if (!Number.isFinite(muLevel) || !(muPortal > 0)) {
        return false;
    }
    return muLevel < ratio * muPortal;
}

/** Флаг нормы полосы для витрины; null — норма вопросов не вызывает. */
export function levelNormFlag(
    muLevel: number,
    muPortal: number | null,
    ratio?: number,
): NormFlag | null {
    return muPortal !== null && levelNormUnderstated(muLevel, muPortal, ratio)
        ? 'level_norm_understated'
        : null;
}

/** Норма пула с подмешанным глобальным прайором: μ и доля данных w. */
function mixWithGlobal(
    pool: NormPool,
    globalKappa: number,
    globalMu: number,
): { value: number; w: number } {
    const denominator = pool.n + globalKappa;
    if (denominator <= 0) {
        return { value: globalMu, w: 0 };
    }
    return {
        value: (pool.s + globalKappa * globalMu) / denominator,
        w: pool.n / denominator,
    };
}

/**
 * κ_boot нового портала: kappa_boot_ratio·median(ñ) по менеджерам пула
 * портала. Без дефолта дампа (global = null), после untilMonths месяцев
 * истории или при пустом пуле стартовой усадки нет (0).
 */
function bootKappa(
    boot: NormBootInput | null | undefined,
    hasGlobal: boolean,
    denominators: readonly number[],
): number {
    if (!boot || !hasGlobal) {
        return 0;
    }
    const until = boot.untilMonths ?? NORM_HIERARCHY_DEFAULTS.bootMonths;
    if (Math.max(0, boot.months) > until) {
        return 0;
    }
    return layerKappa(
        denominators,
        boot.ratio ?? NORM_HIERARCHY_DEFAULTS.bootRatio,
    );
}

/**
 * Норма слоя leave-one-out (план §4.2): μ_lk — полоса стажа без менеджера m
 * при ≥ minBandManagers менеджерах полосы, иначе μ_pk — портал без m.
 * Из пула выбрасываются менеджер m и все менеджер-месяцы с
 * excludeFromNorms (daysSource proxy или D < min_workdays_month).
 * Глобальный слой подмешивается силой κ_global (после пула) либо κ_boot
 * нового портала — берётся большая из них; при пустом пуле портала норма —
 * глобальный дефолт μ_0k с w = 0. При слое полосы возвращается и норма
 * портала без m (portalValue) с флагом «полоса занижена составом».
 */
export function leaveOneOutNorm(input: NormHierarchyInput): NormResult {
    const minBand =
        input.minBandManagers ?? NORM_HIERARCHY_DEFAULTS.minBandManagers;
    const usable = input.cells.filter(
        cell =>
            cell.managerId !== input.managerId &&
            cell.excludeFromNorms !== true &&
            cell.n > 0,
    );
    const band = input.tenureBand
        ? usable.filter(cell => cell.tenureBand === input.tenureBand)
        : [];
    const useBand = band.length >= minBand;
    const configuredKappa = Math.max(
        0,
        input.global?.kappa ?? NORM_HIERARCHY_DEFAULTS.portalToGlobal,
    );
    const kappaBoot = bootKappa(
        input.boot,
        input.global !== null && input.global !== undefined,
        usable.map(cell => cell.n),
    );
    const globalKappa = Math.max(configuredKappa, kappaBoot);
    const globalMu = input.global?.mu ?? 0;
    const portal = mixWithGlobal(poolOf(usable), globalKappa, globalMu);
    const pool = useBand ? poolOf(band) : poolOf(usable);
    const mixed = useBand ? mixWithGlobal(pool, globalKappa, globalMu) : portal;
    const layer: NormLayer =
        pool.n <= 0 ? 'global' : useBand ? 'tenure' : 'portal';
    const portalValue = layer === 'tenure' ? portal.value : null;

    return {
        value: mixed.value,
        layer,
        n: pool.n,
        w: mixed.w,
        excludedManagerId: input.managerId,
        portalValue,
        bandUnderstated:
            portalValue !== null &&
            levelNormUnderstated(mixed.value, portalValue),
        globalKappa,
        boot: kappaBoot > 0 && kappaBoot > configuredKappa,
    };
}

/**
 * Норма слоя как прайор усадки: μ из иерархии, κ — сила слоя
 * (layerKappa(...) из kappa.ts либо κ_a для темпов).
 */
export function toShrinkPrior(norm: NormResult, kappa: number): ShrinkPrior {
    return { mu: norm.value, kappa: Math.max(0, kappa) };
}
