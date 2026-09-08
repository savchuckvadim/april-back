import { AI_ANALYTICS_PARAM_DEFAULTS } from '../params/registry.const';
import { StyleAxisCode, StyleFunnelShape } from './style-axes.const';
import { STYLE_TAG_LIMITS, StyleTagTier } from './style-tags.const';

/**
 * Причины пониженного доверия профиля и оси (документ 4.1) — расширение
 * `METRIC_CONFIDENCE_REASONS` собственными кодами стиля.
 */
export const STYLE_CONFIDENCE_REASONS = {
    fewCalls: 'few-calls',
    fewPeers: 'few-peers',
    indistinguishable: 'indistinguishable',
    noTenure: 'no-tenure',
    optOut: 'opt-out',
} as const;
export type StyleConfidenceReason =
    (typeof STYLE_CONFIDENCE_REASONS)[keyof typeof STYLE_CONFIDENCE_REASONS];

/**
 * Контракты профиля стиля (документ `ai/tasks/ai-analytics-manager-style.md`,
 * разделы 3 и 4.1). Вынесены отдельно от расчёта, чтобы и сборка снапшота
 * `ai-analytics-style`, и презентер витрины зависели от типов, а не от
 * математики.
 */

/** Единица наблюдения: один разбор со стандартизованными остатками осей. */
export interface StyleRow {
    managerId: string;
    /** Ось → остаток единицы в единицах σ_w портала (шаги 1–3 документа). */
    axes: Partial<Record<StyleAxisCode, number>>;
}

const defaultNumber = (code: string, fallback: number): number => {
    const value = AI_ANALYTICS_PARAM_DEFAULTS[code];
    return typeof value === 'number' ? value : fallback;
};

/**
 * Дефолты профиля: восемь кодов реестра `style_*` плюс константы документа,
 * настройкой не являющиеся (сетка τ, доля минимума для яруса «похоже»).
 * Новых кодов стиля реестр не заводит — здесь только их чтение.
 */
export const STYLE_PROFILE_DEFAULTS = {
    minCalls: defaultNumber('style_min_calls', 40),
    minPeers: defaultNumber('style_min_peers', 8),
    ropeDelta: defaultNumber('style_rope_delta', 0.2),
    pIn: defaultNumber('style_p_in', 0.8),
    pOut: defaultNumber('style_p_out', 0.6),
    zRaw: defaultNumber('style_z_raw', 2.33),
    intervalZ: defaultNumber('style_interval_z', 1.282),
    tenureKappa: defaultNumber('style_tenure_kappa', 5),
    /** Коллега входит в норму с этим n (документ 3.3, `style_min_calls`). */
    peerMinCalls: 20,
    /** Минимум коллег для яруса «похоже» (режим малой команды, 3.7). */
    minPeersLikely: 5,
    /** Доля `minCalls` для яруса «похоже» — Спирмен–Браун под R = 0,6. */
    likelyRatio: 0.64,
    /** Узлы сетки τ, масштаб half-normal прайора и потолок сетки в σ_w. */
    tauNodes: 50,
    tauPriorScale: 0.35,
    tauMaxScale: 1.5,
    /** Верхняя 80 %-граница τ ниже — ось «неразличима» (все работают так же). */
    indistinguishableTau: 0.1,
    /** BH-квантиль для яруса «похоже». */
    fdrQ: 0.1,
    maxTags: STYLE_TAG_LIMITS.maxTags,
} as const;

/** Опции вызова: пороги реестра, переопределённые слоями настроек. */
export interface StyleProfileOptions {
    minCalls?: number;
    minPeers?: number;
    peerMinCalls?: number;
    ropeDelta?: number;
    pIn?: number;
    pOut?: number;
    zRaw?: number;
    intervalZ?: number;
    tenureKappa?: number;
    maxTags?: number;
    /** Полоса стажа менеджера — оффсет β_band к нулю с силой tenureKappa. */
    tenureBands?: Readonly<Record<string, string>>;
    /** Подписи прошлого окна — гистерезис по `style_p_out`. */
    previousTags?: readonly string[];
    funnelShape?: StyleFunnelShape;
}

export interface StyleConfidence {
    level: 'ok' | 'low' | 'none';
    reason?: StyleConfidenceReason;
}

export interface StyleAxisEstimate {
    code: StyleAxisCode;
    n: number;
    peers: number;
    /** σ_w коллег: разброс единиц внутри менеджера (LOO). */
    sigmaW: number;
    /** Сырой контраст к LOO-норме коллег, в σ_w. */
    rawContrast: number;
    seRaw: number;
    zRaw: number;
    pRaw: number;
    /** Усаженное отклонение δ̃ и его 80 %-интервал. */
    dTilde: number;
    sdPost: number;
    ci80: [number, number];
    pRope: number;
    /** Верхняя 80 %-граница апостериора τ. */
    tauUpper80: number;
    confidence: StyleConfidence;
}

export interface StyleTag {
    code: string;
    title: string;
    axis: StyleAxisCode;
    tier: StyleTagTier;
    label: string;
    /** Опора подписи в числах — то, что показывается в карточке. */
    basis: string;
    n: number;
    pRope: number;
    d: number;
    ci80: [number, number];
    /** Подпись удержана гистерезисом прошлого окна (p_ROPE ≥ `style_p_out`). */
    kept: boolean;
}

export interface StyleProfile {
    managerId: string;
    /** Сравнимых разборов менеджера в окне. */
    calls: number;
    /** Коллег в норме (менеджеров с n ≥ peerMinCalls, без самого субъекта). */
    peers: number;
    /** Ось → усаженное отклонение δ̃; пусто при `confidence: none`. */
    vector: Record<string, number>;
    axes: StyleAxisEstimate[];
    tags: StyleTag[];
    /** Σ(1 − p_ROPE) по выданным подписям — ожидаемое число ложных. */
    expectedFalseTags: number;
    funnelShape: StyleFunnelShape;
    confidence: StyleConfidence;
}
