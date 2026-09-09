/**
 * Константы норм, рычагов, стиля и готовности в витрине (план Фазы 2,
 * поток 16b): направление разрыва ребра, флаг «норма уровня занижена
 * составом», соответствие рёбер исходам «Внимания» и пороги показа.
 *
 * Пороги, которые уже объявлены библиотекой (гейты готовности
 * `AI_READINESS_GATE_DEFAULTS`, `lever_max`, `n_min_none`,
 * `style_min_calls`), здесь НЕ дублируются — витрина берёт их оттуда:
 * правила режимов и отбора живут в одном месте (§5.1).
 */
import type { AiAnalyticsFunnelEdgeCode } from './ai-overview.const';

/** Направление разрыва к норме слоя: выше нормы, ниже нормы, разрыва нет. */
export const AI_ANALYTICS_GAP_DIRECTIONS = ['above', 'below', 'none'] as const;
export type AiAnalyticsGapDirection =
    (typeof AI_ANALYTICS_GAP_DIRECTIONS)[number];

/**
 * Флаги нормы ребра. `level_norm_understated` — норма полосы (уровня)
 * заметно ниже нормы портала: полоса набрана составом, а не мастерством,
 * и сравнивать менеджера только с ней нечестно. Фронт в этом случае
 * показывает оба разрыва (`levelNorm` и `portalNorm`).
 */
export const AI_ANALYTICS_NORM_FLAGS = ['level_norm_understated'] as const;
export type AiAnalyticsNormFlag = (typeof AI_ANALYTICS_NORM_FLAGS)[number];

/**
 * Пороги показа норм в витрине: доля, ниже которой норма полосы считается
 * заниженной составом (μ_lk < 0,7·μ_pk — план §4.2), и минимальный
 * знаменатель ребра, при котором разрыв вообще считается.
 */
export const AI_ANALYTICS_NORM_LIMITS = {
    levelUnderstatedRatio: 0.7,
    minEdgeExposure: 1,
} as const;

/**
 * Исходы «Внимания» и рёбра воронки, из которых берутся факт и норма
 * уровня: презентации — из ребра «звонок → презентация», счета — из
 * «КП → счёт», продажи — из «счёт → продажа». Числитель ребра и есть
 * факт исхода, норма уровня × знаменатель — ожидание по норме.
 */
export const AI_ANALYTICS_OUTCOME_EDGES = {
    presentations: 'call_to_presentation',
    invoices: 'offer_to_invoice',
    deals: 'invoice_to_sale',
} as const satisfies Record<string, AiAnalyticsFunnelEdgeCode>;

/**
 * KPI-коды плана руководителя, по которым считается разрыв плана: сначала
 * презентации (знаменатель больше — норма устойчивее), при отсутствии
 * плана презентаций — звонки.
 */
export const AI_ANALYTICS_PLAN_GAP_CODES = {
    presentations: 'presentation_uniq',
    calls: 'call',
} as const;
