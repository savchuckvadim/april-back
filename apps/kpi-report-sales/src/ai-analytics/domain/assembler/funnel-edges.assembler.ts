/**
 * Рёбра воронки менеджера (план §4.2, поток 16b). Вынесены из
 * `manager-facts.assembler.ts`: тот собирает KPI-факты периода, этот —
 * только воронку, иначе оба файла не влезают в лимит «≤ 300 строк».
 *
 * Фаза 1b отдавала долю самоотчёта без усадки (`priorSource: none`).
 * С Фазы 2, когда есть месячная модель портала, доля усаживается к норме
 * слоя: `rate` становится апостериором E[θ] с долей собственных данных
 * `w`, у ребра появляются норма слоя, норма портала, разрыв и трактовка.
 * Нормы приходят ГОТОВЫМИ из снапшота модели — витрина их не считает
 * (leave-one-out по 6–12 месяцам × менеджеры × рёбра — месячный шаг).
 *
 * Чистые функции.
 */
import {
    confidenceFor,
    edgeGap,
    edgePosterior,
    METRIC_CONFIDENCE_REASONS,
    MetricValue,
    rateMetric,
    type EdgeGapKind,
} from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_NORM_LIMITS } from '../../constants/ai-norms.const';
import {
    AI_ANALYTICS_FUNNEL_EDGES,
    AI_ANALYTICS_FUNNEL_SHAPE,
    AiAnalyticsEdgeEstimand,
    AiAnalyticsFunnelShape,
} from '../../constants/ai-overview.const';
import { AiFunnelEdgeDto } from '../../dto/ai-funnel-edge.dto';
import type { ManagerEdgeNorm, ManagerNorms } from './norms.assembler';
import type { ManagerKpiPeriod } from './overview-model.types';

/** Счётчик самоотчёта по innerCode ребра воронки. */
function edgeCounter(kpi: ManagerKpiPeriod, innerCode: string): number {
    switch (innerCode) {
        case 'call_done':
            return kpi.calls.done;
        case 'presentation_uniq_done':
            return kpi.presentationsUniq.done;
        case 'ev_offer_act_send':
            return kpi.documents.offers;
        case 'ev_invoice_act_send':
            return kpi.documents.invoices;
        case 'ev_success_done':
            return kpi.outcomes.success;
        default:
            return 0;
    }
}

/** Доля s/n; s > n — числитель и знаменатель из разных событий. */
export function edgeRate(s: number, n: number): MetricValue {
    const rate = rateMetric(s, n);
    if (s > n && rate.value !== null) {
        return {
            ...rate,
            confidence: {
                level: 'low',
                reason: METRIC_CONFIDENCE_REASONS.mixedSources,
            },
        };
    }
    return rate;
}

/** Рёбра воронки по KPI-фактам, без усадки (priorSource none). */
export function toFunnel(kpi: ManagerKpiPeriod | undefined): AiFunnelEdgeDto[] {
    return AI_ANALYTICS_FUNNEL_EDGES.map(edge => {
        const n = kpi ? edgeCounter(kpi, edge.from) : 0;
        const s = kpi ? edgeCounter(kpi, edge.to) : 0;
        return {
            edge: edge.code,
            title: edge.title,
            n,
            s,
            rate: edgeRate(s, n),
            priorSource: 'none',
        };
    });
}

/** Форма воронки по доле счетов без презентации при ≥ minInvoices счетов. */
export function toFunnelShape(
    kpi: ManagerKpiPeriod | undefined,
): AiAnalyticsFunnelShape {
    const invoices = kpi?.documents.invoices ?? 0;
    if (invoices < AI_ANALYTICS_FUNNEL_SHAPE.minInvoices || !kpi) {
        return 'unknown';
    }
    const withoutPresentation =
        (invoices - kpi.documents.invoicesAfterPresentation) / invoices;
    if (withoutPresentation >= AI_ANALYTICS_FUNNEL_SHAPE.closerShare) {
        return 'closer';
    }
    if (withoutPresentation <= AI_ANALYTICS_FUNNEL_SHAPE.presenterShare) {
        return 'presenter';
    }
    return 'balanced';
}

/** Опции усадки рёбер: трактовка портала (одна на все рёбра). */
export interface FunnelNormsOptions {
    /** `edgeKind` модели портала: prob — вероятность, rate — интенсивность. */
    estimand?: AiAnalyticsEdgeEstimand;
}

/**
 * Апостериор ребра: значение показывается по тем же правилам «честного
 * мало данных», что и доля без усадки (n < n_min_none → value = null),
 * но само число уже усажено к норме слоя, а `w` показывает, сколько в нём
 * собственных данных менеджера.
 */
function posteriorMetric(
    base: MetricValue,
    s: number,
    n: number,
    norm: ManagerEdgeNorm,
): MetricValue {
    const posterior = edgePosterior({
        successes: s,
        exposure: n,
        prior: { mu: norm.mu, kappa: norm.kappa },
    });
    if (base.confidence.level === 'none') {
        return { ...base, w: posterior.w };
    }
    return {
        ...base,
        value: posterior.value,
        w: posterior.w,
        confidence: confidenceFor(n, 'rate'),
        ...(posterior.ci90 ? { ci90: posterior.ci90 } : {}),
    };
}

/** Разрыв к норме слоя в единицах ребра; норма пуста — разрыва нет. */
function gapOf(
    s: number,
    n: number,
    norm: ManagerEdgeNorm,
    kind: EdgeGapKind,
): Pick<AiFunnelEdgeDto, 'gap' | 'gapDirection'> {
    if (n < AI_ANALYTICS_NORM_LIMITS.minEdgeExposure || norm.n <= 0) {
        return {};
    }
    const result = edgeGap({
        kind,
        manager: { successes: s, exposure: n },
        reference: { successes: norm.mu * norm.n, exposure: norm.n },
    });
    return { gap: result.delta, gapDirection: result.direction };
}

/** Ребро с нормой слоя: усадка, разрыв, слой приора и флаг нормы. */
function withNorm(
    edge: AiFunnelEdgeDto,
    norm: ManagerEdgeNorm,
    options: FunnelNormsOptions,
): AiFunnelEdgeDto {
    const kind: EdgeGapKind = options.estimand ?? 'prob';
    return {
        ...edge,
        rate: posteriorMetric(edge.rate, edge.s, edge.n, norm),
        levelNorm: norm.mu,
        ...(norm.portalMu === null ? {} : { portalNorm: norm.portalMu }),
        ...gapOf(edge.s, edge.n, norm, kind),
        estimand: kind,
        ...(norm.flag === null ? {} : { normFlag: norm.flag }),
        priorSource: norm.layer,
    };
}

/**
 * Рёбра воронки с нормами слоя: `levelNorm`, `w` в метрике, `estimand`,
 * разрыв и реальный `priorSource`. Норм нет (модели портала нет либо
 * менеджера в ней нет) — поведение Фазы 1b: доля без усадки и
 * `priorSource: 'none'` (штатная деградация §5.4).
 */
export function toFunnelWithNorms(
    kpi: ManagerKpiPeriod | undefined,
    norms: ManagerNorms | null | undefined,
    options: FunnelNormsOptions = {},
): AiFunnelEdgeDto[] {
    const byEdge = new Map(
        (norms?.edges ?? []).map(norm => [norm.edge, norm] as const),
    );
    return toFunnel(kpi).map(edge => {
        const norm = byEdge.get(edge.edge);
        return norm === undefined ? edge : withNorm(edge, norm, options);
    });
}
