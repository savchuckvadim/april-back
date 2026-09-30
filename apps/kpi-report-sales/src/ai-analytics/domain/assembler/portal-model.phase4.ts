/**
 * Сборка частей модели портала Фазы 4 (план §4.4, §4.11, §10): связь
 * качества с результатом по данным (режим `data`), след пула порталов,
 * входы ступеней L4/L5 и источник календаря в готовности.
 *
 * Оркестрация готовых функций библиотеки (`forecastStageOf`,
 * `recommendationsStageOf`, `readinessStageFlagsOf`) — своих порогов нет.
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import {
    readinessStageFlagsOf,
    readinessStagesFrom,
    type AiBetaSource,
    type AiEdgeEstimand,
    type BetaGateCountdown,
    type ParamContext,
    type PoolSnapshot,
    type QualityLinkSnapshot,
    type ReadinessStages,
    resolveNumberParam,
} from '@lib/sales-ai-analytics';
import type { AiCalendarSource } from '../loaders/calendar.util';
import { usablePool } from './portal-model.estimates.phase4';
import { poolEdgeOf, type PortalNormsPool } from './portal-model.norms.pool';
import type {
    PortalModelPhase4Facts,
    PortalPoolUsageFacts,
    PortalQualityLinkFacts,
} from './portal-model.phase4.types';
import type { PortalEdgeNormFacts } from './portal-model.types';

/** Минимум пар гипотезы портала для режима `hypothesis` (план §4.11). */
const MIN_HYPOTHESIS_PAIRS = 2;

/** Минимум точек кривой `p̂(S)`, при котором режим «по данным» честен. */
const MIN_CURVE_POINTS = 2;

/** Связь качества из снапшота месяца в форме модели; нет — null. */
export function qualityLinkFactsOf(
    snapshot: QualityLinkSnapshot | null | undefined,
): PortalQualityLinkFacts | null {
    if (snapshot === null || snapshot === undefined) return null;

    return {
        monthKey: snapshot.monthKey,
        status: snapshot.status,
        published: snapshot.gate.published,
        curve: snapshot.curve.map(point => ({ s: point.s, p: point.p })),
        sRef: snapshot.sRef,
        pRef: snapshot.pRef,
        within: snapshot.within,
        between: snapshot.between,
        pooled: snapshot.pooled,
        reliability: {
            r: snapshot.reliability.r,
            rBetween: snapshot.reliability.rBetween,
            within: snapshot.reliability.within,
            between: snapshot.reliability.between,
            pooled: snapshot.reliability.pooled,
        },
        calibrationSlope: snapshot.calibration.slope,
        placebo:
            snapshot.placebo === null
                ? null
                : {
                      lead: snapshot.placebo.lead,
                      passed: snapshot.placebo.passed,
                  },
        streak: snapshot.gate.streak,
        gateMonths: snapshot.gate.months,
        n: snapshot.sample.n,
        events: snapshot.sample.events,
        managers: snapshot.sample.managers,
    };
}

/** Режим «по данным»: гейт опубликован и кривая пригодна. */
export const isDataLink = (link: PortalQualityLinkFacts | null): boolean =>
    link !== null && link.published && link.curve.length >= MIN_CURVE_POINTS;

/**
 * Режим связи «качество → исход»: опубликованная оценка по данным, иначе
 * гипотеза портала (≥ 2 пар), иначе честное «связи нет».
 */
export function modelBetaSourceOf(
    hypothesisPairs: number,
    link: PortalQualityLinkFacts | null,
): AiBetaSource {
    if (isDataLink(link)) return 'data';

    return hypothesisPairs >= MIN_HYPOTHESIS_PAIRS ? 'hypothesis' : 'none';
}

/**
 * Счётчик «до оценки связи»: по фактическому дизайну выборки из снапшота
 * связи, если он есть, иначе — расчёт по объёмам окна (как в Фазе 2).
 */
export function modelBetaCountdownOf(
    snapshot: QualityLinkSnapshot | null | undefined,
    fallback: BetaGateCountdown,
): BetaGateCountdown {
    return snapshot?.countdown ?? fallback;
}

/** Пул для норм: оценённый пул той же трактовки рёбер; иначе null. */
export function normsPoolOf(
    pool: PoolSnapshot | null | undefined,
    estimand: AiEdgeEstimand,
    registry: ParamContext,
): PortalNormsPool | null {
    const usable = usablePool(pool);

    return usable === null
        ? null
        : {
              edges: usable.edges,
              estimand,
              globalKappa: Math.max(
                  0,
                  resolveNumberParam('kappa_portal_to_global', registry) ?? 0,
              ),
          };
}

/** Что модель взяла из пула — для отчёта; пула нет — null. */
export function poolUsageOf(
    pool: PoolSnapshot | null | undefined,
    usage: {
        readonly norms: PortalNormsPool | null;
        readonly edges: readonly PortalEdgeNormFacts[];
        readonly lagTable: boolean;
        readonly seasonPooled: boolean;
        readonly checkPrior: boolean;
    },
): PortalPoolUsageFacts | null {
    if (pool === null || pool === undefined) return null;

    return {
        monthKey: pool.monthKey,
        status: pool.status,
        eligible: pool.eligible,
        kappaEdges: usage.edges
            .filter(
                edge =>
                    edge.kappaSource === 'kleinman' &&
                    poolEdgeOf(usage.norms, edge.edge) !== null,
            )
            .map(edge => edge.edge),
        globalPriorKappa: usage.norms?.globalKappa ?? 0,
        lagTable: usage.lagTable,
        seasonPooled: usage.seasonPooled,
        checkPrior: usage.checkPrior,
        beta:
            pool.beta === null
                ? null
                : {
                      value: pool.beta.betaPool,
                      ci90: [pool.beta.ci90[0], pool.beta.ci90[1]],
                      iSquared: pool.beta.iSquared,
                      portals: pool.beta.portals,
                      label: pool.beta.label,
                  },
    };
}

/**
 * Входы ступеней L4/L5 из последних снапшотов и флагов портала; ни
 * снапшотов, ни флагов — null (ступени не рассматриваются).
 */
export function readinessStagesOf(
    facts: Pick<
        PortalModelPhase4Facts,
        'forecastBacktest' | 'recommendationEffect'
    >,
    registry: ParamContext,
): ReadinessStages | null {
    return readinessStagesFrom(
        facts.forecastBacktest ?? null,
        facts.recommendationEffect ?? null,
        readinessStageFlagsOf(registry),
    );
}

/**
 * Календарь импортирован: источник известен — всё, кроме запасного
 * календаря РФ; источника нет (старый снапшот, ручной вызов) — прежнее
 * правило по праздникам ключа настроек.
 */
export function calendarImportedOf(
    source: AiCalendarSource | undefined,
    holidays: number,
): boolean {
    return source === undefined ? holidays > 0 : source !== 'fallback';
}
