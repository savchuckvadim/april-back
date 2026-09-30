import type { AiBetaSource } from '@lib/sales-ai-analytics';
import {
    buildForecastPayload,
    type ForecastBuildInput,
} from '../domain/assembler/forecast.assembler';
import { linkOf } from '../domain/assembler/forecast.plan';
import type { PortalQualityLinkFacts } from '../domain/assembler/portal-model.phase4.types';
import type { PortalModelPayload } from '../domain/assembler/portal-model.types';

/**
 * Связь «качество → исход» в ночном прогнозе (находка data-flow-1): при
 * опубликованной связи («по данным») рычаг качества и компонента
 * «качество» утечек появляются; в режимах `none` и `hypothesis` — нет.
 */
const EDGES = [
    { edge: 'call_to_presentation', mu: 0.15 },
    { edge: 'presentation_to_offer', mu: 0.45 },
    { edge: 'offer_to_invoice', mu: 0.5 },
    { edge: 'invoice_to_sale', mu: 0.6 },
] as const;

const CURVE = [
    { s: 4, p: 0.25 },
    { s: 5, p: 0.3 },
    { s: 6, p: 0.4 },
    { s: 7, p: 0.5 },
    { s: 8, p: 0.6 },
    { s: 9, p: 0.7 },
];

function qualityLink(): PortalQualityLinkFacts {
    return {
        monthKey: '2026-08',
        status: 'published',
        published: true,
        curve: CURVE,
        sRef: 7,
        pRef: 0.5,
        within: null,
        between: null,
        pooled: { value: 0.4, se: 0.1, ci90: [0.24, 0.56] },
        reliability: {
            r: null,
            rBetween: null,
            within: null,
            between: null,
            pooled: null,
        },
        calibrationSlope: null,
        placebo: null,
        streak: 2,
        gateMonths: 2,
        n: 400,
        events: 180,
        managers: 6,
    };
}

function model(betaSource: AiBetaSource): PortalModelPayload {
    return {
        edges: EDGES.map(item => ({ ...item, n: 500, kappa: 30 })),
        managerNorms: [],
        sRef: 7,
        cap: 0,
        capActivity: 'call',
        chainSharePct: 80,
        betaSource,
        lagCdf: {
            kind: 'exponential',
            medianDays: 10,
            n: 0,
            points: [
                { days: 7, value: 0.4 },
                { days: 14, value: 0.63 },
                { days: 28, value: 0.86 },
            ],
        },
        qualityLink: betaSource === 'data' ? qualityLink() : null,
    } as unknown as PortalModelPayload;
}

function input(
    betaSource: AiBetaSource,
    quality: { score: number; n: number } | null = { score: 6, n: 40 },
): ForecastBuildInput {
    return {
        day: '2026-09-15',
        monthKey: '2026-09',
        workdaysInMonth: 22,
        daysElapsed: 10,
        daysLeft: 12,
        model: model(betaSource),
        modelSnapshotId: 'model-1',
        hasStageHistory: false,
        registry: {},
        manager: {
            managerId: '11',
            doneSales: 1,
            entryDone: 200,
            planHead: 10,
            override: null,
            levelTarget: null,
            lastMonthSales: 4,
            openEpisodes: [],
            edges: [
                { edge: 'call_to_presentation', n: 200, s: 20 },
                { edge: 'presentation_to_offer', n: 20, s: 6 },
                { edge: 'offer_to_invoice', n: 6, s: 3 },
                { edge: 'invoice_to_sale', n: 3, s: 1 },
            ],
            norms: {
                managerId: '11',
                tenureBand: '6-18',
                edges: EDGES.map(item => ({
                    ...item,
                    layer: 'portal',
                    n: 100,
                    w: 1,
                    kappa: 30,
                })),
            },
            quality,
        },
        seed: 7,
        meta: {
            calcVersion: 'v1',
            paramsVersion: 'p1',
            comparableFrom: null,
            generatedAt: '2026-09-15T01:00:00.000Z',
            modelSnapshotId: 'model-1',
        },
    } as ForecastBuildInput;
}

describe('ночной прогноз: связь качества «по данным»', () => {
    it('linkOf в режиме data берёт кривую модели и применяет её', () => {
        const link = linkOf(model('data'));

        expect(link.applied).toBe(true);
        expect(link.curve.length).toBe(CURVE.length);
        expect(link.pRef).toBeCloseTo(0.5, 6);
        expect(link.beta).toBe(0.4);
        expect(link.reason).toBeNull();
    });

    it('linkOf вне режима data — без кривой и с прежними причинами', () => {
        expect(linkOf(model('none'))).toMatchObject({
            applied: false,
            curve: [],
            reason: 'no-beta',
        });
        expect(linkOf(model('hypothesis'))).toMatchObject({
            applied: false,
            curve: [],
            reason: 'hypothesis-only',
        });
    });

    it('при опубликованной связи в рычагах есть рычаг качества', () => {
        const payload = buildForecastPayload(input('data'));
        const lever = payload.levers.find(item => item.lever === 'quality');

        expect(lever).toBeDefined();
        expect(lever?.ruleCode).toBe('quality-weak-section');
        expect(lever?.deltaSales ?? 0).toBeGreaterThan(0);
        expect(lever?.basis[0]).toContain('с 6,0 до 7,0');
        // (p̂(7) − p̂(6)) × 24 презентации до конца месяца × Π θ ниже × F̄ ≤ 0,72.
        expect(lever?.deltaSales ?? 1).toBeLessThanOrEqual(0.1 * 24 * 0.3);
    });

    it('при опубликованной связи утечки считают компоненту качества', () => {
        const payload = buildForecastPayload(input('data'));

        expect(payload.leaks.some(leak => leak.component === 'quality')).toBe(
            true,
        );
    });

    it.each(['none', 'hypothesis'] as const)(
        'в режиме %s рычага и утечки качества нет',
        betaSource => {
            const payload = buildForecastPayload(input(betaSource));

            expect(payload.levers.some(item => item.lever === 'quality')).toBe(
                false,
            );
            expect(
                payload.leaks.some(leak => leak.component === 'quality'),
            ).toBe(false);
        },
    );

    it('без оценки менеджера рычага качества нет', () => {
        const payload = buildForecastPayload(input('data', null));

        expect(payload.levers.some(item => item.lever === 'quality')).toBe(
            false,
        );
    });

    it('мало разборов (ниже порога раздела) — рычага качества нет', () => {
        const payload = buildForecastPayload(input('data', { score: 6, n: 5 }));

        expect(payload.levers.some(item => item.lever === 'quality')).toBe(
            false,
        );
    });
});
