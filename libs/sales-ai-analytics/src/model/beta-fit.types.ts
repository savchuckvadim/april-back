/**
 * Словарь оценки β «качество → ближний исход» (план `ai-sales-analytics`,
 * §4.4): спецификации, формы вырождения по правилу EPV, оценки с
 * интервалами, результат модели и сводный результат.
 *
 * Вынесено из `beta-fit.ts`, чтобы рабочий файл оставался в пределах
 * 300 строк.
 */
import type { AiBetaLeadKind } from './beta-sample.types';
import type { ReliabilityCorrection } from './reliability-correction';

/**
 * Спецификации: `mundlak` — разложение `β_w·(S_i − S̄_m) + β_b·(S̄_m − S̄_p)`,
 * `pooled` — один наклон при `S_i − S̄_p`.
 */
export const AI_BETA_FIT_SPECS = ['mundlak', 'pooled'] as const;

export type AiBetaFitSpec = (typeof AI_BETA_FIT_SPECS)[number];

/**
 * Формы модели по правилу EPV (план §4.4 «правило усложнения»): при
 * нехватке событий сначала убирается γ, затем страты (одна α), затем
 * β_b (остаётся α + β_w либо α + β_pooled); `insufficient` — событий не
 * хватает даже на α + β, чисел наружу нет.
 */
export const AI_BETA_FIT_FORMS = [
    'full',
    'no-gamma',
    'single-intercept',
    'slope-only',
    'insufficient',
] as const;

export type AiBetaFitForm = (typeof AI_BETA_FIT_FORMS)[number];

/** Оценка коэффициента с SE и 90 %-интервалом. */
export interface BetaEstimate {
    readonly value: number;
    readonly se: number;
    readonly ci90: readonly [number, number];
}

/** Что входит в модель при данной форме. */
export interface BetaFormDesign {
    readonly form: AiBetaFitForm;
    readonly gamma: boolean;
    readonly strata: boolean;
    readonly between: boolean;
    /** Число оцениваемых фиксированных параметров. */
    readonly fixedParams: number;
}

/** Опорные ковариаты кривой `p̂(S)` (план §4.4, §4.8). */
export interface BetaCurveReference {
    readonly sBarPortal: number;
    /** Доли страт в выборке — веса α_страта. */
    readonly strataShares: Readonly<Partial<Record<AiBetaLeadKind, number>>>;
    /** Медиана `callsInEpisode`. */
    readonly medianCalls: number;
    /** Средний оффсет портал×месяц. */
    readonly meanOffset: number;
}

/** Результат одной спецификации. */
export interface BetaModelFit {
    readonly spec: AiBetaFitSpec;
    readonly form: AiBetaFitForm;
    readonly n: number;
    readonly events: number;
    readonly fixedParams: number;
    /** Событий на параметр; null — параметров нет. */
    readonly epv: number | null;
    readonly converged: boolean;
    readonly iterations: number;
    readonly logLikelihood: number;
    /** Коэффициенты по именам столбцов дизайна. */
    readonly coefficients: Readonly<Record<string, number>>;
    /** SE с поправкой на кластеризацию. */
    readonly standardErrors: Readonly<Record<string, number>>;
    readonly strataIntercepts: Readonly<
        Partial<Record<AiBetaLeadKind, number>>
    >;
    readonly managerEffects: Readonly<Record<string, number>>;
    /** Линейный предиктор и `p̂` по строкам выборки. */
    readonly eta: readonly number[];
    readonly predicted: readonly number[];
}

/**
 * Поправки на надёжность предиктора (regression calibration, план §4.4
 * «ошибка измерения»): для `S_i` — `icc_form`, для среднего менеджера
 * `S̄_m` — Спирмен–Браун `r_n = n·r/(1 + (n − 1)·r)` при среднем числе
 * строк на менеджера.
 */
export interface BetaReliability {
    /** `icc_form`; null — не измерена, поправки нет. */
    readonly r: number | null;
    /** Надёжность `S̄_m` по Спирмену–Брауну; null — `r` не измерена. */
    readonly rBetween: number | null;
    /** Среднее число строк на менеджера — `n` Спирмена–Брауна. */
    readonly rowsPerManager: number;
    readonly within: ReliabilityCorrection | null;
    readonly between: ReliabilityCorrection | null;
    readonly pooled: ReliabilityCorrection | null;
}

/** Сводная оценка β по обеим спецификациям. */
export interface BetaFit {
    readonly within: BetaEstimate | null;
    readonly between: BetaEstimate | null;
    readonly pooled: BetaEstimate | null;
    readonly gamma: BetaEstimate | null;
    /** Свободные члены страт pooled-модели. */
    readonly strataIntercepts: Readonly<
        Partial<Record<AiBetaLeadKind, number>>
    >;
    /** Случайные эффекты менеджеров pooled-модели. */
    readonly managerEffects: Readonly<Record<string, number>>;
    readonly n: number;
    readonly events: number;
    /** Событий на параметр pooled-модели. */
    readonly epv: number | null;
    readonly form: Readonly<Record<AiBetaFitSpec, AiBetaFitForm>>;
    readonly converged: boolean;
    readonly iterations: number;
    readonly logLikelihood: Readonly<Record<AiBetaFitSpec, number>>;
    readonly models: Readonly<Record<AiBetaFitSpec, BetaModelFit>>;
    readonly reliability: BetaReliability;
    /** Множитель информации `d_eff`, применённый к SE. */
    readonly designEffect: number;
    readonly managerEffectSd: number;
    readonly reference: BetaCurveReference;
}

export interface BetaFitOptions {
    /** σ_u случайного эффекта менеджера; по умолчанию `beta_manager_effect_sd`. */
    readonly managerEffectSd?: number;
    /** Минимум событий на параметр; по умолчанию `beta_min_epv`. */
    readonly minEpv?: number;
    /** `d_eff`; по умолчанию ориентир формулы мощности. */
    readonly designEffect?: number;
    /** Надёжность предиктора `icc_form`; null/не задана — без поправки. */
    readonly reliability?: number | null;
    /** Квантиль 90 %-интервала; по умолчанию `z_compare`. */
    readonly z?: number;
    readonly maxIterations?: number;
    readonly tolerance?: number;
}
