import {
    AI_READINESS_PHASE4_REASON_CODES,
    type ParamContext,
} from '@lib/sales-ai-analytics';
import {
    buildPortalModelPayload,
    type PortalModelBuildInput,
} from '../domain/assembler/portal-model.assembler';
import { AI_PORTAL_SEASON_NOTES } from '../domain/assembler/portal-model.estimates.phase4';
import {
    calendarImportedOf,
    isDataLink,
    modelBetaSourceOf,
    normsPoolOf,
    qualityLinkFactsOf,
    readinessStagesOf,
} from '../domain/assembler/portal-model.phase4';
import { poolEdgeOf } from '../domain/assembler/portal-model.norms.pool';
import type { PortalManagerMonth } from '../domain/assembler/portal-model.types';
import {
    backtestSnapshot,
    effectSnapshot,
    poolSnapshot,
    qualityLinkSnapshot,
} from './fixtures/phase4-snapshots.fixture';

/**
 * Модель портала Фазы 4: связь качества по данным (режим `data`), пул
 * порталов в нормах/лаге/сезоне/чеке, сверхдисперсия по неделям, ступени
 * готовности L4/L5 и источник календаря. Синтетика: 6 месяцев × 5
 * менеджеров — гейт Клейнмана открыт, базовый режим готовности — нормы.
 */
const KEYS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
// Код витрины: пул хранит коды канона (e1), модель — коды витрины.
const EDGE = 'call_to_presentation';

function month(
    managerId: string,
    monthKey: string,
    s: number,
): PortalManagerMonth {
    return {
        monthKey,
        managerId,
        tenureBand: null,
        edges: [{ edge: EDGE, n: 100, s }],
        excludeFromNorms: false,
        workedDays: 20,
        daysSource: 'calendar',
        callsDone: 400,
        presentations: 20,
        salesCount: 3,
        averageCheck: 100_000,
        planSales: null,
        level: 'middle',
        score: { value: 7, n: 30 },
    };
}

const MONTHS = KEYS.flatMap(key =>
    Array.from({ length: 5 }, (unused, index) =>
        month(String(11 + index), key, 10 + index * 6),
    ),
);

function input(
    over: Partial<PortalModelBuildInput> = {},
): PortalModelBuildInput {
    return {
        monthKey: '2026-09',
        window: KEYS,
        months: MONTHS,
        registry: {},
        qualityGroups: [],
        stageThetas: [],
        saleLags: [],
        cycleMedianDays: null,
        chainSharePct: 0,
        edgeKind: 'rate',
        edgeKindReason: 'chain-below-enter',
        historyMonths: 8,
        hypothesisPairs: 0,
        readiness: {
            enabled: true,
            pipelineEnabled: true,
            calendarImported: true,
            rosterLevels: 5,
            rosterConfirmedAt: '',
            comparableFrom: '',
        },
        sanity: null,
        events: [],
        detectedEvents: [],
        signature: { rubricVersion: null, scriptHash: null, priceMedian: null },
        meta: {
            calcVersion: 'sam-1.0.0',
            paramsVersion: 'pv-1',
            comparableFrom: null,
            generatedAt: '2026-10-03T01:00:00.000Z',
            modelSnapshotId: null,
        },
        ...over,
    };
}

const FLAGS_ON: ParamContext = {
    portal: {
        forecast_stage_enabled: true,
        recommendations_stage_enabled: true,
    },
};

describe('portal-model.phase4: связь качества и режим β', () => {
    it('нет снапшота связи — прежний режим none/hypothesis', () => {
        expect(qualityLinkFactsOf(null)).toBeNull();
        expect(modelBetaSourceOf(0, null)).toBe('none');
        expect(modelBetaSourceOf(2, null)).toBe('hypothesis');
    });

    it('опубликованная связь с кривой — режим data', () => {
        const link = qualityLinkFactsOf(qualityLinkSnapshot());
        expect(isDataLink(link)).toBe(true);
        expect(modelBetaSourceOf(2, link)).toBe('data');
        expect(link).toMatchObject({
            status: 'published',
            streak: 2,
            gateMonths: 2,
            n: 420,
            placebo: { passed: true },
        });
    });

    it('не опубликована или кривая короче двух точек — не data', () => {
        const estimated = qualityLinkFactsOf(
            qualityLinkSnapshot({
                status: 'estimated',
                gate: {
                    passedNow: true,
                    streak: 1,
                    months: 2,
                    published: false,
                    timestampLeakOk: true,
                },
            }),
        );
        const short = qualityLinkFactsOf(
            qualityLinkSnapshot({ curve: [{ s: 7, p: 0.3 }] }),
        );
        expect(modelBetaSourceOf(0, estimated)).toBe('none');
        expect(modelBetaSourceOf(0, short)).toBe('none');
    });

    it('модель несёт кривую и β, режим data гасит счётчик', () => {
        const payload = buildPortalModelPayload(
            input({ phase4: { qualityLink: qualityLinkSnapshot() } }),
        );
        expect(payload.betaSource).toBe('data');
        expect(payload.betaCountdown).toBeNull();
        expect(payload.qualityLink?.curve).toHaveLength(3);
        expect(payload.qualityLink?.pooled?.ci90).toEqual([0.17, 0.31]);
    });

    it('оценка без публикации — счётчик по фактическому дизайну выборки', () => {
        const payload = buildPortalModelPayload(
            input({
                phase4: {
                    qualityLink: qualityLinkSnapshot({
                        status: 'estimated',
                        gate: {
                            passedNow: false,
                            streak: 0,
                            months: 2,
                            published: false,
                            timestampLeakOk: true,
                        },
                        countdown: {
                            seNow: 0.09,
                            presentationsLeft: 77,
                            monthsLeft: 2,
                            presentationsForSe: 500,
                            holdMonths: 1,
                        },
                    }),
                },
            }),
        );
        expect(payload.betaSource).toBe('none');
        expect(payload.betaCountdown?.presentationsLeft).toBe(77);
    });
});

describe('portal-model.phase4: ступени готовности L4/L5', () => {
    it('ни снапшотов, ни флагов — ступени не рассматриваются', () => {
        expect(readinessStagesOf({}, {})).toBeNull();
        const payload = buildPortalModelPayload(input({ phase4: {} }));
        expect(payload.readiness).toMatchObject({ mode: 'norms', reasons: [] });
        expect(payload.readinessStages).toBeUndefined();
    });

    it('прогноз проверен и включён — forecast; советы пройдены — recommendations', () => {
        const forecast = buildPortalModelPayload(
            input({
                registry: { portal: { forecast_stage_enabled: true } },
                phase4: { forecastBacktest: backtestSnapshot() },
            }),
        );
        expect(forecast.readiness.mode).toBe('forecast');
        expect(forecast.readiness.reasons).toEqual([
            AI_READINESS_PHASE4_REASON_CODES.recommendationsEffectMissing,
        ]);

        const full = buildPortalModelPayload(
            input({
                registry: FLAGS_ON,
                phase4: {
                    forecastBacktest: backtestSnapshot(),
                    recommendationEffect: effectSnapshot(),
                },
            }),
        );
        expect(full.readiness).toMatchObject({
            mode: 'recommendations',
            reasons: [],
        });
        expect(full.readinessStages?.forecast?.stageEnabled).toBe(true);
    });

    it('гейт пройден, флаг выключен — режим норм с причиной', () => {
        const payload = buildPortalModelPayload(
            input({ phase4: { forecastBacktest: backtestSnapshot() } }),
        );
        expect(payload.readiness).toMatchObject({
            mode: 'norms',
            reasons: [AI_READINESS_PHASE4_REASON_CODES.forecastDisabled],
        });
    });

    it('мало теневых месяцев — причина с гейтом реестра портала', () => {
        const payload = buildPortalModelPayload(
            input({
                registry: {
                    portal: {
                        forecast_stage_enabled: true,
                        forecast_shadow_min_months: 12,
                    },
                },
                phase4: { forecastBacktest: backtestSnapshot() },
            }),
        );
        expect(payload.readiness.reasons).toContain(
            'forecast-shadow-months-below-12',
        );
        // Гейты записаны рядом со снимком ступеней — витрина судит так же.
        expect(payload.readinessStageGates?.forecastShadowMonths).toBe(12);
    });
});

describe('portal-model.phase4: календарь (хвост 1)', () => {
    it('источник известен — импорт всё, кроме запасного', () => {
        expect(calendarImportedOf('import', 0)).toBe(true);
        expect(calendarImportedOf('override', 0)).toBe(true);
        expect(calendarImportedOf('fallback', 12)).toBe(false);
    });

    it('источника нет — прежнее правило по праздникам', () => {
        expect(calendarImportedOf(undefined, 3)).toBe(true);
        expect(calendarImportedOf(undefined, 0)).toBe(false);
    });

    it('источник календаря уходит в готовность снапшота', () => {
        const payload = buildPortalModelPayload(
            input({
                readiness: {
                    ...input().readiness,
                    calendarImported: false,
                    calendarSource: 'fallback',
                },
            }),
        );
        expect(payload.readiness.calendarSource).toBe('fallback');
        expect(payload.readiness.mode).toBe('descriptive');
    });
});

describe('portal-model.phase4: пул порталов', () => {
    it('неоценённый пул в нормы не идёт', () => {
        expect(normsPoolOf(null, 'rate', {})).toBeNull();
        expect(
            normsPoolOf(poolSnapshot({ status: 'insufficient' }), 'rate', {}),
        ).toBeNull();
        expect(normsPoolOf(poolSnapshot(), 'rate', {})?.globalKappa).toBe(0);
    });

    it('κ̄ пула регуляризует оценку Клейнмана, прайор μ₀ по умолчанию выключен', () => {
        const alone = buildPortalModelPayload(input());
        const pooled = buildPortalModelPayload(
            input({ phase4: { pool: poolSnapshot() } }),
        );
        expect(alone.edges[0].kappaSource).toBe('kleinman');
        expect(pooled.edges[0].kappa).not.toBeCloseTo(alone.edges[0].kappa, 6);
        expect(pooled.pool).toMatchObject({
            status: 'estimated',
            eligible: 3,
            kappaEdges: [EDGE],
            globalPriorKappa: 0,
            beta: { value: 0.2, iSquared: 0.35, label: 'hybrid' },
        });
        expect(pooled.managerNorms[0].edges[0].mu).toBeCloseTo(
            alone.managerNorms[0].edges[0].mu,
            12,
        );
    });

    it('при kappa_portal_to_global > 0 норма подтягивается к μ₀ пула', () => {
        const pooled = buildPortalModelPayload(
            input({
                registry: { portal: { kappa_portal_to_global: 50 } },
                phase4: { pool: poolSnapshot() },
            }),
        );
        const norm = pooled.managerNorms[0].edges[0];
        expect(norm.w).toBeCloseTo(norm.n / (norm.n + 50), 12);
        expect(pooled.pool?.globalPriorKappa).toBe(50);
    });

    it('ребро пула (код канона) находится по коду витрины; без пары в каноне — нет', () => {
        const norms = normsPoolOf(poolSnapshot(), 'rate', {});
        expect(poolEdgeOf(norms, 'call_to_presentation')?.edge).toBe('e1');
        expect(poolEdgeOf(norms, 'e1')?.edge).toBe('e1');
        expect(poolEdgeOf(norms, 'offer_to_invoice')).toBeNull();
        // Другая трактовка ребра — пул не применяется.
        expect(
            poolEdgeOf(
                normsPoolOf(poolSnapshot(), 'prob', {}),
                'call_to_presentation',
            ),
        ).toBeNull();
    });

    it('сезон, чек и таблица лага берут пул как прайор', () => {
        const payload = buildPortalModelPayload(
            input({ phase4: { pool: poolSnapshot() } }),
        );
        expect(payload.seasonIndex?.source).toBe('pooled');
        expect(payload.season.note).toBe(AI_PORTAL_SEASON_NOTES.pooled);
        expect(payload.checkLognormal).toMatchObject({
            source: 'shrunk',
            priorFromPool: true,
            n: 90,
        });
        expect(payload.pool).toMatchObject({
            seasonPooled: true,
            checkPrior: true,
            lagTable: false,
        });
    });
});

describe('portal-model.phase4: сверхдисперсия по неделям', () => {
    it('точек нет — значение реестра без оценки', () => {
        const payload = buildPortalModelPayload(input({ phase4: {} }));
        expect(payload.overdispersion.source).toBe('default');
        expect(payload.overdispersionFit).toBeNull();
    });

    it('недель достаточно — оценка квази-Пуассона', () => {
        const weeklyActivity = Array.from({ length: 26 }, (unused, week) => ({
            count: week % 2 === 0 ? 10 : 30,
            exposure: 5,
            cellKey: '11:cold',
        }));
        const payload = buildPortalModelPayload(
            input({ phase4: { weeklyActivity } }),
        );
        expect(payload.overdispersion.source).toBe('estimated');
        expect(payload.overdispersion.value).toBeGreaterThan(1);
        expect(payload.overdispersionFit?.weeks).toBe(26);
    });
});
