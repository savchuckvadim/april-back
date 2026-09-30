import {
    RECOMMENDATION_EFFECT_DEFAULTS,
    resolveNumberParam,
    type BetaEstimate,
    type ForecastBacktestSnapshot,
    type ParamContext,
    type PoolSnapshot,
    type RecommendationEffectSnapshot,
    type ShareWithInterval,
} from '@lib/sales-ai-analytics';
import { qualityLinkFactsOf } from '../domain/assembler/portal-model.phase4';
import type {
    PortalPoolUsageFacts,
    PortalQualityLinkFacts,
} from '../domain/assembler/portal-model.phase4.types';
import type { PortalModelPayload } from '../domain/assembler/portal-model.types';
import type { Phase4LatestSnapshots } from '../domain/loaders/phase4-snapshots.loader';
import type { AiAboutDto } from '../dto/ai-about.dto';
import type {
    AiAboutEdgeEffectDto,
    AiAboutRecommendationsEffectDto,
} from '../dto/ai-about-phase4-effect.dto';
import type {
    AiAboutForecastAccuracyDto,
    AiAboutPoolDto,
} from '../dto/ai-about-phase4-pool.dto';
import type {
    AiAboutIntervalDto,
    AiAboutQualityLinkDto,
    AiAboutShareDto,
} from '../dto/ai-about-phase4.dto';

/**
 * Секции Фазы 4 блока «Как считаем» (план §4.4, §4.8, §4.10, §10): связь
 * качества с результатом, точность прогноза, пул порталов и эффект
 * советов. Числа — только из последних снапшотов и модели портала, пороги
 * — из реестра портала; своих чисел билдер не держит. Нет данных —
 * секция null (§5.4).
 *
 * Чистые функции.
 */

/** Входы секций: последние снапшоты Фазы 4 и модель портала. */
export interface AiAboutPhase4Input {
    readonly latest: Phase4LatestSnapshots | null;
    readonly model: Partial<PortalModelPayload> | null;
    readonly registry: ParamContext;
}

export type AiAboutPhase4Sections = Pick<
    AiAboutDto,
    'qualityLink' | 'forecastAccuracy' | 'pool' | 'recommendationsEffect'
>;

/** Оценка с интервалом из пары «значение + [низ; верх]». */
const intervalOf = (
    value: number | null,
    ci90: readonly [number, number] | null | undefined,
): AiAboutIntervalDto | null =>
    value === null || !Number.isFinite(value)
        ? null
        : { value, low: ci90?.[0] ?? null, high: ci90?.[1] ?? null };

const estimateOf = (
    estimate: BetaEstimate | null,
): AiAboutIntervalDto | null =>
    estimate === null ? null : intervalOf(estimate.value, estimate.ci90);

const shareOf = (share: ShareWithInterval): AiAboutShareDto => ({
    value: share.value,
    low: share.ci90?.[0] ?? null,
    high: share.ci90?.[1] ?? null,
    n: share.n,
});

/**
 * Связь качества в форме секции. Оценки связи (within/between/pooled) —
 * только после гейта (`published`): до него связь считается в тени и
 * наружу не показывается (правило плана Фазы 4). Статус, серия проверок,
 * вердикты проверок и объём выборки — всегда.
 */
export function aboutQualityLinkOf(
    link: PortalQualityLinkFacts | null,
): AiAboutQualityLinkDto | null {
    if (link === null) return null;
    const slope = link.calibrationSlope;
    const shown = link.published;

    return {
        monthKey: link.monthKey,
        status: link.status,
        published: link.published,
        within: shown ? estimateOf(link.within) : null,
        between: shown ? estimateOf(link.between) : null,
        pooled: shown ? estimateOf(link.pooled) : null,
        reliability: link.reliability.r,
        calibrationSlope:
            slope === null ? null : intervalOf(slope.slope, slope.ci90),
        placeboPassed: link.placebo?.passed ?? null,
        gatePassedMonths: link.streak,
        gateMonths: link.gateMonths,
        n: link.n,
        events: link.events,
        managers: link.managers,
    };
}

/** Точность прогноза отдела в форме секции. */
export function aboutForecastAccuracyOf(
    snapshot: ForecastBacktestSnapshot | null,
): AiAboutForecastAccuracyDto | null {
    if (snapshot === null) return null;
    const backtest = snapshot.backtest;

    return {
        monthKey: snapshot.monthKey,
        status: snapshot.status,
        reasons: [...snapshot.reasons],
        shadowMonths: snapshot.shadowMonths,
        shadowMinMonths: snapshot.shadowMinMonths,
        coverage:
            backtest === null
                ? null
                : {
                      value: backtest.coverage.share,
                      low: backtest.coverage.ci90[0],
                      high: backtest.coverage.ci90[1],
                      n: backtest.coverage.days,
                  },
        coverageTarget: backtest?.coverage.target ?? null,
        errorVsLastMonth:
            backtest === null
                ? null
                : intervalOf(
                      backtest.mase.naive.value,
                      backtest.mase.naive.ci90,
                  ),
        errorVsMean3:
            backtest === null
                ? null
                : intervalOf(
                      backtest.mase.mean3.value,
                      backtest.mase.mean3.ci90,
                  ),
        errorRatioMax: backtest?.mase.max ?? null,
    };
}

/** Пул порталов в форме секции; вклад в модель — из её последнего расчёта. */
export function aboutPoolOf(
    snapshot: PoolSnapshot | null,
    usage: PortalPoolUsageFacts | null | undefined,
    registry: ParamContext,
): AiAboutPoolDto | null {
    if (snapshot === null) return null;
    const beta = snapshot.beta;
    const self = snapshot.portals.find(
        portal => portal.portalKey === snapshot.selfKey,
    );

    return {
        monthKey: snapshot.monthKey,
        status: snapshot.status,
        participants: snapshot.eligible,
        minParticipants: resolveNumberParam('pool_min_portals', registry) ?? 0,
        minHistoryMonths:
            resolveNumberParam('pool_min_history_months', registry) ?? 0,
        selfReason: self?.reason ?? null,
        qualityLink:
            beta === null ? null : intervalOf(beta.betaPool, beta.ci90),
        heterogeneity: beta?.iSquared ?? null,
        label: beta?.label ?? null,
        edgesFromPool: usage?.kappaEdges.length ?? 0,
        lagFromPool: usage?.lagTable ?? false,
        seasonFromPool: usage?.seasonPooled ?? false,
    };
}

type EdgeSnapshot = RecommendationEffectSnapshot['beforeAfter'][number];

/** Доля шага; выборка меньше `minN` (`n_min_none`) — ни одного числа. */
const shareOfSample = (
    sample: { s: number; n: number },
    minN: number,
): number | null =>
    sample.n > 0 && sample.n >= minN ? sample.s / sample.n : null;

/**
 * Шаг воронки «до/после»: доли и разница — только при выборках не меньше
 * `n_min_none` в обоих окнах. Проверка повторяет библиотечную, чтобы и
 * снапшоты, записанные до неё, не показали чисел на малой выборке.
 */
const edgeEffectOf = (
    edge: EdgeSnapshot,
    minN: number,
): AiAboutEdgeEffectDto => {
    const before = shareOfSample(edge.before, minN);
    const after = shareOfSample(edge.after, minN);

    return {
        edge: edge.edge,
        before,
        after,
        diff:
            before === null || after === null
                ? null
                : intervalOf(edge.diff, edge.ci90),
        windows: edge.n,
    };
};

/** `n_min_none` расчёта; в старом снапшоте без него — дефолт реестра. */
const minNOf = (snapshot: RecommendationEffectSnapshot): number => {
    const minN = snapshot.params.minN;

    return Number.isFinite(minN) ? minN : RECOMMENDATION_EFFECT_DEFAULTS.minN;
};

/** Эффект советов в форме секции. */
export function aboutRecommendationsEffectOf(
    snapshot: RecommendationEffectSnapshot | null,
): AiAboutRecommendationsEffectDto | null {
    if (snapshot === null) return null;
    const minN = minNOf(snapshot);

    return {
        monthKey: snapshot.monthKey,
        status: snapshot.gate.status,
        reasons: [...snapshot.gate.reasons],
        issued: snapshot.issued,
        completedWindows: snapshot.completedWindows,
        done: snapshot.done,
        disagree: snapshot.disagree,
        doneShare: shareOf(snapshot.doneShare),
        disagreeShare: shareOf(snapshot.disagreeShare),
        beforeAfter: snapshot.beforeAfter.map(edge => edgeEffectOf(edge, minN)),
        goodhartFlags: snapshot.goodhart.flags,
        goodhartManagers: snapshot.goodhart.managersWithFlags,
    };
}

/**
 * Секции Фазы 4: связь качества — из снапшота связи (иначе из модели
 * портала), точность прогноза, пул и эффект советов — из последних
 * снапшотов. Снапшотов не читали (`latest: null`) — секций нет вовсе.
 */
export function buildAboutPhase4(
    input: AiAboutPhase4Input,
): AiAboutPhase4Sections {
    const latest = input.latest;
    if (latest === null) return {};
    const link =
        qualityLinkFactsOf(latest.qualityLink) ??
        input.model?.qualityLink ??
        null;

    return {
        qualityLink: aboutQualityLinkOf(link),
        forecastAccuracy: aboutForecastAccuracyOf(latest.forecastBacktest),
        pool: aboutPoolOf(latest.pool, input.model?.pool, input.registry),
        recommendationsEffect: aboutRecommendationsEffectOf(
            latest.recommendationEffect,
        ),
    };
}
