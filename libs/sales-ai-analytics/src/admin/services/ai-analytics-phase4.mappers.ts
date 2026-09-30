/**
 * Снапшоты Фазы 4 → ответы админ-ручек (волна B, поток B3). Чистые
 * функции: нагрузка — контракт `contracts/snapshot.phase4.types.ts`,
 * но записи старой или чужой формы не должны ронять ручку — каждый
 * маппер сначала проверяет опорные поля (статус из справочника) и
 * отдаёт null, если форма чужая.
 *
 * Домены порталов пула сюда не попадают: в нагрузке их и нет — только
 * обезличенные ключи.
 */
import type {
    ForecastBacktestSnapshot,
    PoolSnapshot,
    QualityLinkSnapshot,
    RecommendationEffectSnapshot,
} from '../../contracts/snapshot.phase4.types';
import { AI_QUALITY_LINK_STATUSES } from '../../contracts/snapshot.phase4.types';
import type { BetaEstimate } from '../../model/beta-fit.types';
import type { ForecastMase } from '../../model/forecast-backtest.types';
import { AI_FORECAST_BACKTEST_STATUSES } from '../../model/forecast-backtest.types';
import {
    AI_POOL_STATUSES,
    type PoolPortalVerdict,
} from '../../model/pool.types';
import type {
    EdgeBeforeAfter,
    ShareWithInterval,
} from '../../model/recommendation-effect.types';
import { RECOMMENDATION_GATE_STATUSES } from '../../model/recommendation-effect.types';
import type { AiAnalyticsAdminSnapshotRecord } from '../ai-analytics-admin-snapshot.store';
import type {
    Phase4BacktestView,
    Phase4EdgeBeforeAfter,
    Phase4EffectView,
    Phase4Estimate,
    Phase4PoolSnapshotView,
    Phase4QualityLinkView,
    Phase4Share,
    Phase4SnapshotRef,
} from './ai-analytics-phase4.types';

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const oneOf = <T extends string>(
    list: readonly T[],
    value: unknown,
): value is T => list.some(item => item === value);

const codes = (value: unknown): string[] =>
    Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];

const pair = (value: readonly number[] | null | undefined): number[] | null =>
    value && value.length === 2 ? [...value] : null;

const refOf = (record: AiAnalyticsAdminSnapshotRecord): Phase4SnapshotRef => ({
    monthKey: record.periodKey,
    generatedAt: record.generatedAt,
});

const estimateOf = (
    value: BetaEstimate | null | undefined,
): Phase4Estimate | null =>
    value ? { value: value.value, ci90: [...value.ci90] } : null;

const shareOf = (value: ShareWithInterval | undefined): Phase4Share => ({
    value: value?.value ?? null,
    ci90: pair(value?.ci90),
    n: value?.n ?? 0,
});

/** Пул порталов: вердикты — только обезличенные ключи и их число. */
export function toPoolView(
    record: AiAnalyticsAdminSnapshotRecord,
): Phase4PoolSnapshotView | null {
    const payload = record.payload;
    if (!isRecord(payload) || !oneOf(AI_POOL_STATUSES, payload.status)) {
        return null;
    }
    const pool = payload as unknown as PoolSnapshot;
    const verdicts: readonly PoolPortalVerdict[] = pool.portals ?? [];
    const portals = verdicts.map(verdict => ({
        key: verdict.portalKey,
        included: verdict.included,
        reason: verdict.reason,
    }));
    const self = portals.find(portal => portal.key === pool.selfKey);
    return {
        ...refOf(record),
        status: pool.status,
        reasons: codes(pool.reasons),
        eligible: pool.eligible ?? 0,
        participants: portals.filter(portal => portal.included).length,
        portals,
        selfKey: pool.selfKey ?? '',
        selfIncluded: self ? self.included : null,
        edges: pool.edges?.length ?? 0,
        beta: pool.beta
            ? {
                  value: pool.beta.betaPool,
                  ci90: [...pool.beta.ci90],
                  iSquared: pool.beta.iSquared,
                  portals: pool.beta.portals,
                  label: pool.beta.label,
              }
            : null,
        betaPortals: pool.evidence?.betaPortals ?? 0,
        minPortalsE2: pool.evidence?.minPortalsE2 ?? 0,
        evidenceReady: pool.evidence?.ready === true,
    };
}

/** Связь «качество → исход»: оценки β, калибровка, плацебо и гейт. */
export function toQualityLinkView(
    record: AiAnalyticsAdminSnapshotRecord,
): Phase4QualityLinkView | null {
    const payload = record.payload;
    if (
        !isRecord(payload) ||
        !oneOf(AI_QUALITY_LINK_STATUSES, payload.status)
    ) {
        return null;
    }
    const link = payload as unknown as QualityLinkSnapshot;
    const slope = link.calibration?.slope ?? null;
    return {
        ...refOf(record),
        status: link.status,
        reasons: codes(link.reasons),
        sampleN: link.sample?.n ?? 0,
        sampleEvents: link.sample?.events ?? 0,
        sampleManagers: link.sample?.managers ?? 0,
        windowDays: link.sample?.windowDays ?? 0,
        within: estimateOf(link.within),
        between: estimateOf(link.between),
        pooled: estimateOf(link.pooled),
        epv: link.epv ?? null,
        reliabilityR: link.reliability?.r ?? null,
        calibrationSlope: slope
            ? { value: slope.slope, ci90: [...slope.ci90] }
            : null,
        calibrationCoversOne: slope ? slope.coversOne : null,
        placeboPassed: link.placebo ? link.placebo.passed : null,
        gatePassedNow: link.gate?.passedNow === true,
        gateStreak: link.gate?.streak ?? 0,
        gateMonths: link.gate?.months ?? 0,
        published: link.gate?.published === true,
        timestampLeakOk: link.gate?.timestampLeakOk === true,
    };
}

const maseValue = (mase: ForecastMase | undefined): number | null =>
    mase?.value ?? null;

/** Проверка точности прогноза отдела по закрытому месяцу. */
export function toBacktestView(
    record: AiAnalyticsAdminSnapshotRecord,
): Phase4BacktestView | null {
    const payload = record.payload;
    if (
        !isRecord(payload) ||
        !oneOf(AI_FORECAST_BACKTEST_STATUSES, payload.status)
    ) {
        return null;
    }
    const snapshot = payload as unknown as ForecastBacktestSnapshot;
    const result = snapshot.backtest ?? null;
    return {
        ...refOf(record),
        status: snapshot.status,
        reasons: codes(snapshot.reasons),
        shadowMonths: snapshot.shadowMonths ?? 0,
        shadowMinMonths: snapshot.shadowMinMonths ?? 0,
        months: result?.months.length ?? 0,
        days: result?.days ?? 0,
        coverageShare: result?.coverage.share ?? null,
        coverageCi90: pair(result?.coverage.ci90),
        coverageTarget: result?.coverage.target ?? null,
        maseNaive: maseValue(result?.mase.naive),
        maseNaiveCi90: pair(result?.mase.naive.ci90),
        maseMean3: maseValue(result?.mase.mean3),
        maseMean3Ci90: pair(result?.mase.mean3.ci90),
        maseMax: result?.mase.max ?? null,
        pinballMean: result?.pinball.mean ?? null,
    };
}

const beforeAfterOf = (item: EdgeBeforeAfter): Phase4EdgeBeforeAfter => ({
    edge: item.edge,
    beforeS: item.before.s,
    beforeN: item.before.n,
    afterS: item.after.s,
    afterN: item.after.n,
    diff: item.diff,
    ci90: pair(item.ci90),
    windows: item.n,
});

/** Эффект советов: доли с интервалами, до/после по рёбрам, гейт L5. */
export function toEffectView(
    record: AiAnalyticsAdminSnapshotRecord,
): Phase4EffectView | null {
    const payload = record.payload;
    if (
        !isRecord(payload) ||
        !isRecord(payload.gate) ||
        !oneOf(RECOMMENDATION_GATE_STATUSES, payload.gate.status)
    ) {
        return null;
    }
    const effect = payload as unknown as RecommendationEffectSnapshot;
    return {
        ...refOf(record),
        issuedMonths: codes(effect.issuedMonths),
        issued: effect.issued ?? 0,
        completedWindows: effect.completedWindows ?? 0,
        done: effect.done ?? 0,
        disagree: effect.disagree ?? 0,
        doneShare: shareOf(effect.doneShare),
        disagreeShare: shareOf(effect.disagreeShare),
        gateStatus: effect.gate.status,
        gateReasons: codes(effect.gate.reasons),
        byLever: (effect.byLever ?? []).map(item => ({
            lever: item.lever,
            issued: item.issued,
            completedWindows: item.completedWindows,
            done: item.done,
            disagree: item.disagree,
            doneShare: shareOf(item.doneShare),
        })),
        beforeAfter: (effect.beforeAfter ?? []).map(beforeAfterOf),
        goodhartFlags: effect.goodhart?.flags ?? 0,
        goodhartManagers: effect.goodhart?.managersWithFlags ?? 0,
    };
}
