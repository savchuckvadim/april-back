/**
 * Контракт связи «качество → исход» (план `ai-sales-analytics`, §4.4).
 *
 * Ключевое правило: **все прикладные величины считаются на шкале
 * вероятности** `p̂(S)` — множитель `r(S) = p̂(S)/p̂(S_ref)`, изо-линия
 * `N·p̂(S) = const`, обратная задача `S_req = p̂⁻¹(…)`. Экспонента
 * `exp(β·ΔS)` допустима только для редкого исхода (продажа, p ≈ 0,07)
 * и помечается флагом `rareOutcomeOnly`.
 *
 * Режимы `betaSource`:
 * - `none` — связи нет (до гейта): множитель 1, `applied: false`;
 * - `hypothesis` — правило портала «при качестве S нужно N презентаций»;
 *   применяется **только** в калькуляторе «что если», в рычаги, планы и
 *   советы β гипотезы не попадает;
 * - `data` — оценка портала (Фаза 4): множитель, изо-линия и `S_req`.
 */

/** Режимы источника связи «качество → исход». */
export const AI_BETA_SOURCES = ['none', 'hypothesis', 'data'] as const;

/** Источник связи качества с исходом. */
export type AiBetaSource = (typeof AI_BETA_SOURCES)[number];

/** Шкала, на которой посчитан множитель качества. */
export const AI_QUALITY_SCALES = ['probability', 'exp-beta'] as const;

/** Шкала множителя: вероятность (штатно) или экспонента (редкий исход). */
export type AiQualityScale = (typeof AI_QUALITY_SCALES)[number];

/** Точка табличной кривой `p̂(S)`: качество и вероятность ближнего исхода. */
export interface QualityPoint {
    /** Оценка качества по шкале 1–10. */
    readonly s: number;
    /** Вероятность ближнего исхода эпизода при этом качестве, (0; 1). */
    readonly p: number;
}

/** Пара гипотезы портала «при качестве S нужно N презентаций». */
export interface QualityHypothesisPair {
    readonly s: number;
    readonly n: number;
}

/** Почему множитель качества не применяется (или применяется особо). */
export type QualityLinkReason =
    | 'no-beta'
    | 'hypothesis-only'
    | 'curve-invalid'
    | 'rare-outcome-exp';

/**
 * Связь «качество → исход» в том виде, в каком её потребляют план дня,
 * рычаги, разложение разрыва и витрина.
 */
export interface QualityLink {
    /** Режим: none | hypothesis | data. */
    readonly betaSource: AiBetaSource;
    /** S_ref — медиана Ŝ полосы 6–18 мес. за 3 мес., fallback 7. */
    readonly sRef: number;
    /** Табличная кривая `p̂(S)`; непуста только при `betaSource: data`. */
    readonly curve: readonly QualityPoint[];
    /** `p̂(S_ref)` — знаменатель множителя; null вне режима `data`. */
    readonly pRef: number | null;
    /** Наклон связи на шкале логита — только для подписи в UI. */
    readonly beta: number | null;
    /** β гипотезы портала — только для калькулятора «что если». */
    readonly hypothesisBeta: number | null;
    /** Множитель посчитан как `exp(β·ΔS)` — только для редкого исхода. */
    readonly rareOutcomeOnly: boolean;
    /** Прикладные величины (множитель, изо-линия, S_req) доступны. */
    readonly applied: boolean;
    /** Причина недоступности связи. */
    readonly reason: QualityLinkReason | null;
}

/** Множитель качества `r(S)` и признак его применения. */
export interface QualityMultiplier {
    /** `r(S) = p̂(S)/p̂(S_ref)`; вне режима `data` — ровно 1. */
    readonly value: number;
    /** Множитель применён к прикладной величине. */
    readonly applied: boolean;
    /** Шкала расчёта множителя. */
    readonly scale: AiQualityScale;
    /** `p̂(S)`; null, если кривой нет. */
    readonly pAtScore: number | null;
    /** `p̂(S_ref)`; null, если кривой нет. */
    readonly pAtRef: number | null;
    /** Множитель посчитан экспонентой (редкий исход). */
    readonly rareOutcomeOnly: boolean;
}
