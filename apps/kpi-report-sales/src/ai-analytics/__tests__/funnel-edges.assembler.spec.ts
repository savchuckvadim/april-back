import {
    edgeRate,
    toFunnel,
    toFunnelShape,
    toFunnelWithNorms,
} from '../domain/assembler/funnel-edges.assembler';
import type { ManagerNorms } from '../domain/assembler/norms.assembler';
import { kpiPeriod, NORM_EDGE } from './fixtures/norms.fixture';

/** Нормы одного ребра: μ слоя, его объём и сила усадки. */
function normsOf(
    mu: number,
    n: number,
    overrides: Partial<ManagerNorms['edges'][number]> = {},
): ManagerNorms {
    return {
        managerId: '10',
        tenureBand: '6-18',
        edges: [
            {
                edge: NORM_EDGE,
                mu,
                layer: 'tenure',
                n,
                w: 0.8,
                kappa: 30,
                portalMu: null,
                flag: null,
                ...overrides,
            },
        ],
    };
}

const edgeOf = (edges: ReturnType<typeof toFunnel>) =>
    edges.find(item => item.edge === NORM_EDGE);

describe('рёбра воронки без норм (поведение Фазы 1b)', () => {
    it('доля самоотчёта, priorSource none, нормы нет', () => {
        const edge = edgeOf(
            toFunnel(kpiPeriod({ calls: 40, presentations: 10 })),
        );

        expect(edge).toMatchObject({ n: 40, s: 10, priorSource: 'none' });
        expect(edge?.rate.value).toBeCloseTo(0.25, 6);
        expect(edge?.levelNorm).toBeUndefined();
        expect(edge?.gap).toBeUndefined();
    });

    it('норм нет → toFunnelWithNorms повторяет toFunnel', () => {
        const kpi = kpiPeriod({ calls: 40, presentations: 10 });

        expect(toFunnelWithNorms(kpi, null)).toEqual(toFunnel(kpi));
        expect(toFunnelWithNorms(kpi, undefined)).toEqual(toFunnel(kpi));
    });

    it('s > n → confidence mixed-sources', () => {
        expect(edgeRate(12, 10).confidence).toEqual({
            level: 'low',
            reason: 'mixed-sources',
        });
    });
});

describe('рёбра воронки с нормами слоя', () => {
    it('заполняет levelNorm, w, estimand и слой приора', () => {
        const edge = edgeOf(
            toFunnelWithNorms(
                kpiPeriod({ calls: 40, presentations: 10 }),
                normsOf(0.3, 400),
                { estimand: 'prob' },
            ),
        );

        expect(edge?.levelNorm).toBeCloseTo(0.3, 6);
        expect(edge?.estimand).toBe('prob');
        expect(edge?.priorSource).toBe('tenure');
        expect(edge?.rate.w).toBeCloseTo(40 / 70, 6);
    });

    it('усадка 4/15 при μ = 0,09 и κ = 30 → 0,149…0,150 (w = 0,33)', () => {
        const edge = edgeOf(
            toFunnelWithNorms(
                kpiPeriod({ calls: 15, presentations: 4 }),
                normsOf(0.09, 300),
            ),
        );

        expect(edge?.rate.value).toBeGreaterThanOrEqual(0.148);
        expect(edge?.rate.value).toBeLessThanOrEqual(0.151);
        expect(edge?.rate.w).toBeCloseTo(0.333, 3);
    });

    it('n ниже порога показа → значения нет, но доля данных приходит', () => {
        const edge = edgeOf(
            toFunnelWithNorms(
                kpiPeriod({ calls: 5, presentations: 1 }),
                normsOf(0.3, 400),
            ),
        );

        expect(edge?.rate.value).toBeNull();
        expect(edge?.rate.w).toBeCloseTo(5 / 35, 6);
        expect(edge?.priorSource).toBe('tenure');
    });

    it('разрыв к норме: направление below при заметном отставании', () => {
        const edge = edgeOf(
            toFunnelWithNorms(
                kpiPeriod({ calls: 60, presentations: 1 }),
                normsOf(0.4, 400),
            ),
        );

        expect(edge?.gap).toBeLessThan(0);
        expect(edge?.gapDirection).toBe('below');
    });

    it('разрыв в пределах практического порога → направление none', () => {
        const edge = edgeOf(
            toFunnelWithNorms(
                kpiPeriod({ calls: 40, presentations: 12 }),
                normsOf(0.3, 400),
            ),
        );

        expect(edge?.gapDirection).toBe('none');
    });

    it('норма портала и флаг доезжают до ребра', () => {
        const edge = edgeOf(
            toFunnelWithNorms(
                kpiPeriod({ calls: 40, presentations: 10 }),
                normsOf(0.1, 400, {
                    portalMu: 0.2,
                    flag: 'level_norm_understated',
                }),
            ),
        );

        expect(edge?.portalNorm).toBeCloseTo(0.2, 6);
        expect(edge?.normFlag).toBe('level_norm_understated');
    });

    it('ребро без нормы в модели остаётся долей самоотчёта', () => {
        const edges = toFunnelWithNorms(
            kpiPeriod({ calls: 40, presentations: 10, offers: 8 }),
            normsOf(0.3, 400),
        );
        const other = edges.find(item => item.edge === 'presentation_to_offer');

        expect(other?.priorSource).toBe('none');
        expect(other?.levelNorm).toBeUndefined();
    });
});

describe('форма воронки', () => {
    it('счетов мало → unknown; много без презентации → closer', () => {
        expect(toFunnelShape(kpiPeriod({ invoices: 5 }))).toBe('unknown');
        expect(
            toFunnelShape(
                kpiPeriod({ invoices: 40, invoicesAfterPresentation: 10 }),
            ),
        ).toBe('closer');
        expect(
            toFunnelShape(
                kpiPeriod({ invoices: 40, invoicesAfterPresentation: 36 }),
            ),
        ).toBe('presenter');
    });
});
