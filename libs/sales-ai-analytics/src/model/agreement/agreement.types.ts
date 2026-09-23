/**
 * Типы согласия оценщика (Фаза 3, поток П7 «test-retest языковой модели»):
 * пары значений одного разбора из двух прогонов одной версией промпта и
 * результаты метрик — каппа Коэна (номинальная, взвешенная, PABAK), ICC
 * по двухфакторной ANOVA, TOST на эквивалентность средних и F1 по
 * множествам возражений. Чистые типы и дефолты из реестра — без DI,
 * Bitrix и Prisma.
 */
import { findParam } from '../../params/registry.const';
import { registryDefault } from '../../params/registry.access';

/** Взвешивание несогласия для упорядоченных категорий (Коэн, 1968). */
export const KAPPA_WEIGHTINGS = ['none', 'linear', 'quadratic'] as const;
export type KappaWeighting = (typeof KAPPA_WEIGHTINGS)[number];

/** Пара категориальных значений одного разбора: первый и второй прогон. */
export interface CategoryPair {
    first: string;
    second: string;
}

/** Пара значений шкалы одного разбора: первый и второй прогон. */
export interface ScalePair {
    first: number;
    second: number;
}

/** Пара множеств кодов (возражения) одного разбора. */
export interface SetPair {
    first: readonly string[];
    second: readonly string[];
}

export interface CohenKappaOptions {
    /**
     * Уровни категории в порядке возрастания (нужны взвешенной каппе).
     * Без них — объединение наблюдаемых значений по алфавиту; пары со
     * значением вне списка в расчёт не входят.
     */
    levels?: readonly string[];
    /** По умолчанию 'none' — номинальная каппа Коэна. */
    weighting?: KappaWeighting;
}

export interface CohenKappaResult {
    /** Пар в расчёте (значения вне уровней отброшены). */
    n: number;
    /** Число уровней k. */
    categories: number;
    weighting: KappaWeighting;
    /** Наблюдаемое согласие p_o (при взвешивании — 1 − взвешенное несогласие). */
    po: number;
    /** Ожидаемое по маргиналам согласие p_e (при взвешивании — взвешенное). */
    pe: number;
    /** κ = (p_o − p_e)/(1 − p_e); null — p_e = 1 (одна категория) или n = 0. */
    kappa: number | null;
    /**
     * PABAK = (k·p_o − 1)/(k − 1) по невзвешенному p_o (Byrt, Bishop,
     * Carlin, 1993); null при k < 2 или n = 0.
     */
    pabak: number | null;
}

/** Двухфакторная ANOVA «объекты × прогоны» и внутриклассовые корреляции. */
export interface IccAnovaResult {
    /** Объектов (строк). */
    n: number;
    /** Прогонов (столбцов). */
    k: number;
    msRows: number;
    msCols: number;
    msError: number;
    /** ICC(2,1) — абсолютное согласие, единичная оценка; обрезан к [0, 1]. */
    icc21: number | null;
    /** ICC(3,1) — согласованность, сдвиг между прогонами не штрафуется; [0, 1]. */
    icc31: number | null;
}

/** Выборочные моменты разностей «первый − второй». */
export interface DifferenceStats {
    n: number;
    mean: number;
    /** Выборочное стандартное отклонение (n − 1); 0 при n = 1. */
    sd: number;
    /** SE среднего = sd/√n. */
    se: number;
}

export interface TostOptions {
    /** Граница эквивалентности Δ > 0: средние равны, если |μ_d| < Δ. */
    bound: number;
    /** Квантиль односторонних тестов; по умолчанию `z_compare`. */
    z?: number;
}

export interface TostResult extends DifferenceStats {
    bound: number;
    z: number;
    /** Уровень каждого одностороннего теста α = 1 − Φ(z). */
    alpha: number;
    /** Интервал (1 − 2α): d̄ ± z·SE. */
    ci: readonly [number, number];
    /** H0: μ_d ≤ −Δ. */
    pLower: number;
    /** H0: μ_d ≥ +Δ. */
    pUpper: number;
    /** p TOST = max(pLower, pUpper). */
    p: number;
    /** Обе H0 отвергнуты ⇔ интервал целиком внутри (−Δ; Δ). */
    equivalent: boolean;
}

export interface F1Counts {
    /** Код есть в обоих прогонах. */
    tp: number;
    /** Код только во втором прогоне (лишний относительно первого). */
    fp: number;
    /** Код только в первом прогоне (потерян вторым). */
    fn: number;
}

export interface F1Result extends F1Counts {
    /** tp/(tp + fp); null — второй прогон ничего не назвал. */
    precision: number | null;
    /** tp/(tp + fn); null — первый прогон ничего не назвал. */
    recall: number | null;
    /** 2·tp/(2·tp + fp + fn); null — кодов нет ни в одном прогоне. */
    f1: number | null;
}

export interface F1CodeResult extends F1Result {
    code: string;
}

/**
 * Дефолты согласия оценщика — величины из реестра параметров.
 * Квота и σ_llm по умолчанию — коды `retest_budget_calls` и
 * `sigma_llm_default`; порог TOST — практический порог оценок; z —
 * квантиль сравнения; ценз измеренной σ_llm — `minN` её дескриптора.
 */
export const AGREEMENT_DEFAULTS = {
    /** `retest_budget_calls` — квота пар test-retest на смену версии. */
    retestBudgetCalls: registryDefault('retest_budget_calls'),
    /** `sigma_llm_default` — σ_llm до измерения, в отчёте для сравнения. */
    sigmaLlmConfigured: registryDefault('sigma_llm_default'),
    /** `delta_prac_score` — граница эквивалентности TOST по шкалам. */
    tostBound: registryDefault('delta_prac_score'),
    /** `z_compare` — квантиль двух односторонних тестов (α = 1 − Φ(z)). */
    z: registryDefault('z_compare'),
    /** Ценз измеренной σ_llm: `minN` кода `sigma_llm_default` (300 пар). */
    minPairs:
        findParam('sigma_llm_default')?.minN ??
        registryDefault('retest_budget_calls'),
} as const;
