import { buildManagerNorms } from '../domain/assembler/norms.assembler';
import { toFunnelWithNorms } from '../domain/assembler/funnel-edges.assembler';
import { buildPortalNorms } from '../domain/assembler/portal-model.norms';
import type { PortalManagerNorms } from '../domain/assembler/portal-model.types';
import {
    kpiPeriod,
    managerNormsFrom,
    NORM_EDGE,
    normCell,
    portalModel,
    portalMonth,
} from './fixtures/norms.fixture';
import { callsOf, overviewFixture } from './fixtures/overview.fixture';

/** Полоса «6-18»: субъект плюс `peers` коллег той же полосы. */
const bandCells = (peers: number) => [
    normCell('10', 3, 20),
    ...Array.from({ length: peers }, (_, index) =>
        normCell(`2${index}`, 5, 20),
    ),
    // Другая полоса — чтобы слой портала отличался от слоя полосы.
    normCell('90', 1, 40, '0-6'),
    normCell('91', 2, 40, '0-6'),
];

const modelWith = (norms: PortalManagerNorms[], portalMu = 0.2) =>
    portalModel({ managerNorms: norms, portalMu });

describe('buildManagerNorms — слой нормы из снапшота модели', () => {
    it('полоса из двух коллег → норма слоя portal, из трёх → tenure', () => {
        const twoPeers = managerNormsFrom(bandCells(2), '10', '6-18');
        const threePeers = managerNormsFrom(bandCells(3), '10', '6-18');

        expect(twoPeers.edges[0].layer).toBe('portal');
        expect(threePeers.edges[0].layer).toBe('tenure');

        const fromPortal = buildManagerNorms(
            modelWith([twoPeers]),
            '10',
            '6-18',
        );
        const fromBand = buildManagerNorms(
            modelWith([threePeers]),
            '10',
            '6-18',
        );

        expect(fromPortal?.edges[0].layer).toBe('portal');
        expect(fromBand?.edges[0].layer).toBe('tenure');
    });

    it('слой нормы доезжает до ребра витрины как priorSource', () => {
        const norms = buildManagerNorms(
            modelWith([managerNormsFrom(bandCells(3), '10', '6-18')]),
            '10',
            '6-18',
        );
        const edges = toFunnelWithNorms(
            kpiPeriod({ calls: 20, presentations: 3 }),
            norms,
        );
        const edge = edges.find(item => item.edge === NORM_EDGE);

        expect(edge?.priorSource).toBe('tenure');
        expect(edge?.levelNorm).toBeCloseTo(0.25, 6);
    });

    it('норма портала — вторая норма ребра, когда норма взята с полосы', () => {
        const norms = buildManagerNorms(
            modelWith([managerNormsFrom(bandCells(3), '10', '6-18')], 0.31),
            '10',
            '6-18',
        );

        expect(norms?.edges[0].portalMu).toBeCloseTo(0.31, 6);
    });

    it('норма полосы ниже 0,7 нормы портала → флаг «занижена составом»', () => {
        const understated: PortalManagerNorms = {
            managerId: '10',
            tenureBand: '6-18',
            edges: [
                {
                    edge: NORM_EDGE,
                    mu: 0.1,
                    layer: 'tenure',
                    n: 120,
                    w: 0.8,
                    kappa: 30,
                },
            ],
        };
        const norms = buildManagerNorms(modelWith([understated], 0.2), '10');
        const edge = toFunnelWithNorms(
            kpiPeriod({ calls: 20, presentations: 3 }),
            norms,
        ).find(item => item.edge === NORM_EDGE);

        expect(norms?.edges[0].flag).toBe('level_norm_understated');
        expect(edge?.normFlag).toBe('level_norm_understated');
        expect(edge?.portalNorm).toBeCloseTo(0.2, 6);
    });

    it('норма полосы близка к портальной → флага нет', () => {
        const norms = buildManagerNorms(
            modelWith([managerNormsFrom(bandCells(3), '10', '6-18')], 0.3),
            '10',
        );

        expect(norms?.edges[0].flag).toBeNull();
    });

    it('менеджера нет в нормах модели → берётся норма портала (его данных в ней нет)', () => {
        const norms = buildManagerNorms(
            modelWith([managerNormsFrom(bandCells(3), '10', '6-18')]),
            '77',
        );

        expect(norms?.edges[0].layer).toBe('portal');
        expect(norms?.edges[0].mu).toBeCloseTo(0.2, 6);
        expect(norms?.edges[0].portalMu).toBeNull();
    });

    it('слой без знаменателя — не норма: усадки к нулю не происходит', () => {
        // Единственный менеджер с данными по ребру: leave-one-out пул
        // пуст (μ = 0, n = 0), сравнивать не с чем — ребро остаётся
        // долей самоотчёта Фазы 1b, а не усаживается к несуществующей
        // норме.
        const months = [
            portalMonth('11', '2026-08', 10, 40),
            portalMonth('11', '2026-09', 10, 40),
        ];
        const snapshot = buildPortalNorms({
            months,
            windowMonths: 2,
            registry: {},
        });

        expect(snapshot.managerNorms[0].edges[0]).toMatchObject({
            layer: 'global',
            mu: 0,
            n: 0,
        });
        const norms = buildManagerNorms(
            portalModel({
                managerNorms: snapshot.managerNorms,
                portalMu: snapshot.edges[0].mu,
                portalN: snapshot.edges[0].n,
            }),
            '11',
            '6-18',
        );
        const edge = toFunnelWithNorms(
            kpiPeriod({ calls: 40, presentations: 10 }),
            norms,
        ).find(item => item.edge === NORM_EDGE);

        expect(norms).toBeNull();
        expect(edge?.priorSource).toBe('none');
        expect(edge?.rate.value).toBeCloseTo(10 / 40, 6);
        expect(edge?.levelNorm).toBeUndefined();
        expect(edge?.normFlag).toBeUndefined();
    });

    it('модели нет, норм в ней нет или форма чужая → норм нет', () => {
        expect(buildManagerNorms(null, '10')).toBeNull();
        expect(buildManagerNorms(undefined, '10')).toBeNull();
        expect(buildManagerNorms(portalModel(), '10')).toBeNull();
        expect(
            buildManagerNorms({ managerNorms: 'нет' } as never, '10'),
        ).toBeNull();
    });

    it('полоса менеджера в нормах отсутствует → берётся переданная', () => {
        const norms = buildManagerNorms(
            modelWith([managerNormsFrom(bandCells(3), '10', null)]),
            '10',
            '18+',
        );

        expect(norms?.tenureBand).toBe('18+');
    });
});

describe('обзор целиком: нормы, рычаги и стиль доезжают до строки', () => {
    const snapshots = {
        model: {
            ...modelWith([managerNormsFrom(bandCells(3), '10', '6-18')]),
            betaSource: 'hypothesis' as const,
            edgeKind: 'prob' as const,
        },
        forecasts: new Map([
            [
                '10',
                {
                    doneSales: 4,
                    levers: [
                        {
                            lever: 'volume',
                            ruleCode: 'volume-below-capacity',
                            deltaSales: 1.2,
                            cost: 90,
                            evidence: 'E1',
                            basis: ['+30 cold'],
                        },
                    ],
                },
            ],
        ]),
        styles: new Map([
            [
                '10',
                {
                    calls: 62,
                    confidence: 'ok',
                    vector: { inquiry: 0.4 },
                    tags: [
                        {
                            code: 'inquiry_high',
                            title: 'Больше выясняет',
                            basis: 'выше на 1,2 балла',
                            n: 62,
                        },
                    ],
                },
            ],
        ]),
    };

    it('строка получает слой нормы, рекомендации и профиль стиля', () => {
        const dto = overviewFixture(callsOf('10', 10), [10], { snapshots });
        const row = dto.managers.find(item => item.managerId === '10');

        expect(row?.funnel.find(edge => edge.edge === NORM_EDGE)).toMatchObject(
            { priorSource: 'tenure', estimand: 'prob' },
        );
        expect(row?.recommendations).toHaveLength(1);
        expect(row?.recommendations[0]).toMatchObject({
            lever: 'volume',
            evidence: 'E1',
        });
        expect(row?.style?.tags[0].code).toBe('inquiry_high');
        // Портал ещё в калибровке: режим гипотезы наружу не выходит,
        // пока не пройден калибровочный гейт (правило библиотеки).
        expect(dto.readiness.mode).toBe('calibration');
        expect(dto.readiness.betaSource).toBe('none');
    });

    it('снапшотов нет → строка как в Фазе 1b', () => {
        const dto = overviewFixture(callsOf('10', 10), [10]);
        const row = dto.managers.find(item => item.managerId === '10');

        expect(row?.funnel.every(edge => edge.priorSource === 'none')).toBe(
            true,
        );
        expect(row?.recommendations).toEqual([]);
        expect(row?.style).toBeNull();
        expect(dto.readiness.betaSource).toBe('none');
    });
});
