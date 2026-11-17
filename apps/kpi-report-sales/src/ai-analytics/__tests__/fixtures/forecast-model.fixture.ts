/**
 * Фикстура модели портала для прогноза дня: два ребра, стадийная θ и
 * экспоненциальная шкала лага. Вынесена из `forecast.step.spec.ts`, чтобы
 * ею пользовались и спеки прогноза от презентаций.
 */
import type { PortalModelPayload } from '../../domain/assembler/portal-model.types';

export const FORECAST_MODEL_EDGE = 'call_to_presentation';
export const FORECAST_MODEL_SECOND_EDGE = 'presentation_to_offer';
export const FORECAST_MODEL_STAGE = 'sales_in_progress';

/** Норма ребра портала с дефолтной усадкой. */
function portalEdge(
    edge: string,
    mu: number,
    n: number,
): PortalModelPayload['edges'][number] {
    return {
        edge,
        mu,
        n,
        kappa: 30,
        layer: 'portal',
        managers: 3,
        kappaSource: 'default',
        kappaKind: 'late',
        kappaGateOpen: false,
        rho: null,
        homogeneous: false,
    };
}

/** Модель портала месяца `monthKey` с нормами менеджеров `managerIds`. */
export function forecastModelPayload(
    monthKey: string,
    managerIds: readonly string[] = ['11'],
): PortalModelPayload {
    return {
        monthKey,
        window: [monthKey],
        observations: 1,
        managers: managerIds.length,
        edges: [
            portalEdge(FORECAST_MODEL_EDGE, 0.2, 500),
            portalEdge(FORECAST_MODEL_SECOND_EDGE, 0.5, 100),
        ],
        managerNorms: managerIds.map(managerId => ({
            managerId,
            tenureBand: '6-18',
            edges: [
                {
                    edge: FORECAST_MODEL_EDGE,
                    mu: 0.2,
                    layer: 'portal',
                    n: 400,
                    w: 1,
                    kappa: 30,
                },
                {
                    edge: FORECAST_MODEL_SECOND_EDGE,
                    mu: 0.5,
                    layer: 'portal',
                    n: 80,
                    w: 1,
                    kappa: 30,
                },
            ],
        })),
        kappa: 30,
        overdispersion: { value: 2.5, source: 'default' },
        mS: 10,
        msSource: 'default',
        msGroups: 0,
        sRef: 7,
        sRefSource: 'default',
        cap: 25,
        capSource: 'default',
        capActivity: 'call',
        cycleMedianDays: 28,
        lagCdf: {
            kind: 'exponential',
            medianDays: 28,
            n: 0,
            points: [
                { days: 7, value: 0.16 },
                { days: 14, value: 0.29 },
                { days: 28, value: 0.5 },
                { days: 60, value: 0.77 },
            ],
        },
        stageTheta: [
            {
                stageCode: FORECAST_MODEL_STAGE,
                order: 8,
                n: 40,
                s: 6,
                value: 0.15,
                w: 0.5,
                ci90: null,
            },
        ],
        chainSharePct: 85,
        edgeKind: 'prob',
        edgeKindReason: 'chain-entered',
        betaSource: 'none',
        betaCountdown: null,
        season: { index: 1, source: 'default', note: 'Сезонность не оценена' },
        readiness: {
            mode: 'descriptive',
            historyMonths: 6,
            presentations: 300,
            sales: 20,
            comparableFrom: '',
            reasons: [],
        },
        sanity: null,
        events: [],
        detectedEvents: [],
        reused: false,
        reusedReason: null,
        signature: {
            rubricVersion: null,
            scriptHash: null,
            priceMedian: null,
        },
        meta: {
            calcVersion: 'sam-1.0.0',
            paramsVersion: 'pv-1',
            comparableFrom: null,
            generatedAt: '2026-09-03T01:00:00.000Z',
            modelSnapshotId: null,
        },
    };
}
