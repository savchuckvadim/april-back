/**
 * Рёбра воронки месяца с трактовкой (план §4.1 «Два кода реестра на
 * ребро», поток 14b).
 *
 * До сцепки звонков со сделками ребро — интенсивность (`rate`): `s > n`
 * законно (сто КП на пятьдесят презентаций — не ошибка). После сцепки то
 * же ребро становится вероятностью продвижения эпизода (`prob`), и там
 * `s > n` означает, что числитель и знаменатель взяты из разных
 * источников: ребро помечается `mixedSources` и наружу как число не идёт.
 *
 * Переключение — только по доле сцепки с гистерезисом 80/70, решает
 * библиотека (`resolveEdgeEstimand`). Чистые функции.
 */
import {
    edgeInvariant,
    resolveEdgeEstimand,
    resolveNumberParam,
    type AiEdgeEstimand,
    type ParamContext,
} from '@lib/sales-ai-analytics';
import { toFunnel } from './manager-facts.assembler';
import type { ManagerKpiPeriod } from './overview-model.types';
import type { ManagerEdgeFacts } from './manager-snapshot.types';

/** Трактовка рёбер портала на месяц и почему она такая. */
export interface MonthEstimand {
    estimand: AiEdgeEstimand;
    /** Доля сцепленных звонков, %; 0 — истории стадий нет. */
    chainSharePct: number;
    /** Код причины из справочника библиотеки (в «Как считаем»). */
    reason: string;
    /** Трактовка сменилась на этом пересчёте — повод сдвинуть историю. */
    switched: boolean;
}

/**
 * Трактовка рёбер месяца: пороги входа и выхода берутся из реестра
 * (`deal_chain_min_pct` / `deal_chain_exit_pct`), доля сцепки — из шины
 * шага истории стадий. Нет истории стадий → доля 0 → интенсивность
 * (штатная деградация §5.4).
 */
export function resolveMonthEstimand(
    registry: ParamContext,
    chainSharePct: number,
    current?: AiEdgeEstimand,
): MonthEstimand {
    const enterPct = resolveNumberParam('deal_chain_min_pct', registry);
    const exitPct = resolveNumberParam('deal_chain_exit_pct', registry);
    const resolved = resolveEdgeEstimand({
        chainSharePct,
        ...(current === undefined ? {} : { current }),
        ...(enterPct === undefined ? {} : { enterPct }),
        ...(exitPct === undefined ? {} : { exitPct }),
    });
    return {
        estimand: resolved.estimand,
        chainSharePct: resolved.chainSharePct,
        reason: resolved.reason,
        switched: resolved.switched,
    };
}

/**
 * Рёбра менеджера за месяц: s/n по KPI-фактам самоотчёта плюс трактовка и
 * признак смешанных источников. Порядок — справочник рёбер витрины.
 */
export function buildManagerEdges(
    kpi: ManagerKpiPeriod | undefined,
    estimand: AiEdgeEstimand,
): ManagerEdgeFacts[] {
    return toFunnel(kpi).map(edge => {
        const invariant = edgeInvariant(edge.s, edge.n, estimand);
        return {
            edge: edge.edge,
            n: edge.n,
            s: edge.s,
            estimand,
            mixedSources: invariant.reason === 'mixed-sources',
        };
    });
}
