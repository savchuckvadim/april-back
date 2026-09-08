import type { QualityLink } from '../contracts/quality-link.types';
import type { ShrinkPrior } from './shrink';

/**
 * Типы разложения разрыва по рёбрам воронки (план §4.5). Вынесены из
 * `model/funnel-gap.ts`, чтобы файл модели оставался в пределах 300 строк.
 */

/** Ребро воронки: собственные переходы, норма слоя и входной объём. */
export interface FunnelEdgeInput {
    readonly code: string;
    /** Переходы менеджера s. */
    readonly successes: number;
    /** Знаменатель ребра n (входы). */
    readonly exposure: number;
    /** Норма слоя μ_lk и сила усадки κ_k. */
    readonly prior: ShrinkPrior;
    /** Входной объём ребра N_k за период. */
    readonly volume: number;
}

/** Путь DAG от входа к продаже. */
export interface FunnelPathInput {
    readonly code: string;
    /** Коды рёбер по порядку — от входа к продаже. */
    readonly edges: readonly string[];
    /** Доля пути в развороте плана (по умолчанию 1). */
    readonly share?: number;
}

/** Компонента «качество» разложения — только при `betaSource: data`. */
export interface FunnelQualityInput {
    /** Оценка качества менеджера Ŝ_m за период. */
    readonly score: number;
    /** Ребро, на объём которого действует изменение качества. */
    readonly edgeCode: string;
}

/** Почему вклад ребра не показывается или не считается утечкой. */
export type FunnelLeakReason = 'low-n' | 'outcomes-at-norm' | 'below-practical';

/** Вклад одного ребра (или качества) в недобор продаж. */
export interface FunnelLeak {
    readonly pathCode: string;
    readonly edgeCode: string;
    readonly component: 'edge' | 'quality';
    /** `E[ΔS_k]` в продажах; null — ниже порога честности. */
    readonly expected: number | null;
    /** 90 %-интервал вклада по сэмплам. */
    readonly ci90: readonly [number, number] | null;
    /** Знаменатель ребра. */
    readonly n: number;
    /** Разрыв доли `μ − E[θ]` (для компоненты качества — 0). */
    readonly delta: number;
    readonly hidden: boolean;
    readonly leak: boolean;
    readonly reason: FunnelLeakReason | null;
}

/** Итог разложения разрыва. */
export interface FunnelGapResult {
    readonly leaks: readonly FunnelLeak[];
    /** `E[ΔS]` — сумма вкладов всех рёбер и качества по всем путям. */
    readonly expectedGap: number;
    readonly samples: number;
    readonly seed: number;
}

/** Вход разложения разрыва. */
export interface FunnelGapInput {
    readonly edges: readonly FunnelEdgeInput[];
    readonly paths: readonly FunnelPathInput[];
    readonly qualityLink?: QualityLink;
    readonly quality?: FunnelQualityInput;
    readonly samples?: number;
    /** `seed = fnv1a(domain|managerId|date|calcVersion)`. */
    readonly seed: number;
    readonly minN?: number;
    readonly practicalDelta?: number;
}

/** Вход перестановочного теста ложных утечек. */
export interface PermutationLeakInput {
    readonly edges: readonly FunnelEdgeInput[];
    readonly paths: readonly FunnelPathInput[];
    readonly iterations?: number;
    readonly samples?: number;
    readonly seed: number;
    readonly minN?: number;
    readonly practicalDelta?: number;
}

/** Итог перестановочного теста доли ложных утечек. */
export interface PermutationLeakResult {
    /** Доля объявленных утечек среди проверенных рёбер, %. */
    readonly falseLeakRatePct: number;
    readonly iterations: number;
    /** Сколько рёбер проверено всего (итерации × рёбра). */
    readonly tested: number;
    readonly leaks: number;
}
