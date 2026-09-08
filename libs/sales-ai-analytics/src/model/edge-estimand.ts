/**
 * Два кода реестра на ребро и переключение между ними
 * (план `ai-sales-analytics`, §4.1 «Два кода реестра на ребро»).
 *
 * До сцепки звонков со сделками ребро — **интенсивность** на агрегатах
 * (`theta_edge_rate`, `s ≤ n` не гарантируется, интервал гамма-отношением);
 * после сцепки то же ребро — **вероятность** продвижения эпизода
 * (`theta_edge_prob`, Beta-биномиал). Это разные оцениваемые величины с
 * собственными числителем, знаменателем, историей и `comparableFrom`, поэтому
 * ряды интенсивностей в апостериоры вероятностей не подмешиваются.
 *
 * Переключение портала на вероятности — **только вперёд**, с гистерезисом по
 * доле сцепки: вход `deal_chain_min_pct = 80 %`, удержание до
 * `deal_chain_exit_pct = 70 %`. Без гистерезиса портал «дрожал» бы между
 * двумя величинами на каждом пересчёте.
 *
 * Инвариант: числитель и знаменатель — из одного источника и одного зерна
 * времени. При вероятностной трактовке `s > n` означает разные источники,
 * и ребро отдаётся с `confidence: none, reason: mixed-sources`.
 */
import type { ParamEdgeEstimand } from '../params/registry.types';

/** Оцениваемая величина ребра: интенсивность или вероятность. */
export const AI_EDGE_ESTIMANDS = [
    'rate',
    'prob',
] as const satisfies readonly ParamEdgeEstimand[];

export type AiEdgeEstimand = (typeof AI_EDGE_ESTIMANDS)[number];

/** Коды реестра, соответствующие каждой трактовке ребра. */
export const AI_EDGE_ESTIMAND_PARAM_CODES = {
    rate: 'theta_edge_rate',
    prob: 'theta_edge_prob',
} as const satisfies Record<AiEdgeEstimand, string>;

/** Код реестра ребра в выбранной трактовке. */
export type AiEdgeEstimandParamCode =
    (typeof AI_EDGE_ESTIMAND_PARAM_CODES)[AiEdgeEstimand];

/** Почему трактовка ребра именно такая — текст «Как считаем». */
export const AI_EDGE_ESTIMAND_REASONS = [
    'chain-below-enter',
    'chain-entered',
    'chain-hold',
    'chain-exited',
] as const;

export type AiEdgeEstimandReason = (typeof AI_EDGE_ESTIMAND_REASONS)[number];

/** Дефолты гистерезиса — зеркало кодов реестра, в процентах. */
export const EDGE_ESTIMAND_DEFAULTS = {
    /** `deal_chain_min_pct` — вход в режим вероятностей. */
    enterPct: 80,
    /** `deal_chain_exit_pct` — выход из режима вероятностей. */
    exitPct: 70,
    /** Трактовка до накопления сцепки. */
    estimand: 'rate',
} as const satisfies {
    enterPct: number;
    exitPct: number;
    estimand: AiEdgeEstimand;
};

export interface ResolveEdgeEstimandInput {
    /** Доля сцепленных звонков в процентах (`chainSharePct`). */
    readonly chainSharePct: number;
    /** Текущая трактовка портала; по умолчанию интенсивность. */
    readonly current?: AiEdgeEstimand;
    /** Порог входа в проценты; по умолчанию 80. */
    readonly enterPct?: number;
    /** Порог выхода в проценты; по умолчанию 70. */
    readonly exitPct?: number;
}

export interface ResolveEdgeEstimandResult {
    readonly estimand: AiEdgeEstimand;
    /** Трактовка сменилась на этом пересчёте — повод сдвинуть `comparableFrom`. */
    readonly switched: boolean;
    readonly reason: AiEdgeEstimandReason;
    readonly chainSharePct: number;
    readonly enterPct: number;
    readonly exitPct: number;
    /** Код реестра, по которому берутся μ, κ и история ребра. */
    readonly paramCode: AiEdgeEstimandParamCode;
}

/** Почему инвариант «один источник» нарушен. */
export const AI_EDGE_INVARIANT_REASONS = [
    'mixed-sources',
    'negative',
    'not-finite',
] as const;

export type AiEdgeInvariantReason = (typeof AI_EDGE_INVARIANT_REASONS)[number];

export interface EdgeInvariantResult {
    readonly ok: boolean;
    readonly reason?: AiEdgeInvariantReason;
    readonly estimand: AiEdgeEstimand;
}

/** Порог выхода не может стоять выше порога входа — иначе гистерезиса нет. */
function normalizeThresholds(input: ResolveEdgeEstimandInput): {
    enterPct: number;
    exitPct: number;
} {
    const enterPct =
        input.enterPct !== undefined && Number.isFinite(input.enterPct)
            ? input.enterPct
            : EDGE_ESTIMAND_DEFAULTS.enterPct;
    const exitRaw =
        input.exitPct !== undefined && Number.isFinite(input.exitPct)
            ? input.exitPct
            : EDGE_ESTIMAND_DEFAULTS.exitPct;

    return { enterPct, exitPct: Math.min(exitRaw, enterPct) };
}

/**
 * Трактовка ребра по доле сцепки с гистерезисом (план §4.1).
 *
 * Из интенсивности в вероятность — при доле **не ниже** порога входа;
 * обратно — только когда доля упала **ниже** порога выхода. В полосе
 * `[exitPct; enterPct)` режим удерживается тем, каким он был.
 */
export function resolveEdgeEstimand(
    input: ResolveEdgeEstimandInput,
): ResolveEdgeEstimandResult {
    const { enterPct, exitPct } = normalizeThresholds(input);
    const share = Number.isFinite(input.chainSharePct)
        ? input.chainSharePct
        : 0;
    const current = input.current ?? EDGE_ESTIMAND_DEFAULTS.estimand;
    const next: AiEdgeEstimand =
        current === 'prob'
            ? share < exitPct
                ? 'rate'
                : 'prob'
            : share >= enterPct
              ? 'prob'
              : 'rate';
    const reason: AiEdgeEstimandReason =
        current === next
            ? current === 'prob'
                ? 'chain-hold'
                : 'chain-below-enter'
            : next === 'prob'
              ? 'chain-entered'
              : 'chain-exited';

    return {
        estimand: next,
        switched: current !== next,
        reason,
        chainSharePct: share,
        enterPct,
        exitPct,
        paramCode: AI_EDGE_ESTIMAND_PARAM_CODES[next],
    };
}

/**
 * Инвариант ребра (план §4.1): числитель и знаменатель — из одного источника.
 * При вероятностной трактовке это проверяется как `s ≤ n`: превышение
 * означает, что числитель взят из другого источника или другого зерна времени,
 * и ребро уходит в `confidence: none` с причиной `mixed-sources`.
 * Для интенсивности `s > n` законно (например, КП на 100 презентаций).
 */
export function edgeInvariant(
    s: number,
    n: number,
    estimand: AiEdgeEstimand,
): EdgeInvariantResult {
    if (!Number.isFinite(s) || !Number.isFinite(n)) {
        return { ok: false, reason: 'not-finite', estimand };
    }
    if (s < 0 || n < 0) {
        return { ok: false, reason: 'negative', estimand };
    }
    if (estimand === 'prob' && s > n) {
        return { ok: false, reason: 'mixed-sources', estimand };
    }

    return { ok: true, estimand };
}
