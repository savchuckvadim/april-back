import {
    FUNNEL_GAP_DEFAULTS,
    decomposeFunnelGap,
    type FunnelEdgeInput,
    type FunnelPathInput,
} from '../model/funnel-gap';
import { mulberry32, seedOf } from '../model/prng';
import { buildQualityLink } from '../model/qav';

/** Ключ расчёта: домен, менеджер, дата, версия кода (план §4.5). */
const SEED = seedOf('demo.bitrix24.ru', '17', '2026-09-08', 'sam-1.0.0');

const SAMPLES = 500;

/** Менеджер ниже нормы на обоих рёбрах пути «звонок → продажа». */
const EDGES: readonly FunnelEdgeInput[] = [
    {
        code: 'e1',
        successes: 15,
        exposure: 100,
        prior: { mu: 0.3, kappa: 30 },
        volume: 100,
    },
    {
        code: 'e5',
        successes: 4,
        exposure: 40,
        prior: { mu: 0.2, kappa: 30 },
        volume: 40,
    },
];

const PATHS: readonly FunnelPathInput[] = [
    { code: 'call-to-sale', edges: ['e1', 'e5'] },
];

const run = (
    edges: readonly FunnelEdgeInput[] = EDGES,
    extra: Partial<Parameters<typeof decomposeFunnelGap>[0]> = {},
) =>
    decomposeFunnelGap({
        edges,
        paths: PATHS,
        samples: SAMPLES,
        seed: SEED,
        ...extra,
    });

describe('decomposeFunnelGap — воспроизводимость и аддитивность', () => {
    it('два запуска с одним seed дают одинаковые E[ΔS]', () => {
        const first = run();
        const second = run();
        expect(second.expectedGap).toBe(first.expectedGap);
        expect(second.leaks.map(leak => leak.expected)).toEqual(
            first.leaks.map(leak => leak.expected),
        );
    });

    it('другой seed даёт другое, но близкое значение', () => {
        const base = run();
        const other = run(EDGES, { seed: SEED + 1 });
        expect(other.expectedGap).not.toBe(base.expectedGap);
        expect(Math.abs(other.expectedGap - base.expectedGap)).toBeLessThan(
            Math.abs(base.expectedGap) * 0.25,
        );
    });

    it('сумма вкладов рёбер равна E[ΔS] пути', () => {
        const result = run();
        const sum = result.leaks.reduce(
            (total, leak) => total + (leak.expected ?? 0),
            0,
        );
        expect(sum).toBeCloseTo(result.expectedGap, 12);
        expect(result.expectedGap).toBeGreaterThan(0);
    });

    it('вклад ребра положителен там, где менеджер ниже нормы', () => {
        const result = run();
        const first = result.leaks.find(leak => leak.edgeCode === 'e1');
        expect(first?.delta).toBeCloseTo(0.3 - 24 / 130, 10);
        expect(first?.leak).toBe(true);
        expect(first?.ci90?.[0]).toBeGreaterThan(0);
    });
});

describe('компонента «качество» — только при betaSource: data', () => {
    const quality = { score: 5, edgeCode: 'e1' } as const;
    const curve = [
        { s: 5, p: 0.36 },
        { s: 7, p: 0.45 },
        { s: 8.5, p: 0.52 },
    ];

    it('в режимах none и hypothesis компоненты нет', () => {
        for (const source of ['none', 'hypothesis'] as const) {
            const result = run(EDGES, {
                quality,
                qualityLink: buildQualityLink({
                    betaSource: source,
                    curve,
                    hypothesisBeta: 0.17,
                }),
            });
            expect(
                result.leaks.some(leak => leak.component === 'quality'),
            ).toBe(false);
        }
    });

    it('в режиме data компонента добавляется и входит в сумму', () => {
        const result = run(EDGES, {
            quality,
            qualityLink: buildQualityLink({
                betaSource: 'data',
                sRef: 7,
                curve,
            }),
        });
        const qualityLeak = result.leaks.find(
            leak => leak.component === 'quality',
        );
        expect(qualityLeak).toBeDefined();
        expect(qualityLeak?.expected as number).toBeGreaterThan(0);
        const sum = result.leaks.reduce(
            (total, leak) => total + (leak.expected ?? 0),
            0,
        );
        expect(sum).toBeCloseTo(result.expectedGap, 12);
    });
});

describe('пороги честности и форма воронки', () => {
    it('утечка скрыта при n < n_min_none', () => {
        const thin: readonly FunnelEdgeInput[] = [
            { ...EDGES[0], successes: 1, exposure: 5 },
            EDGES[1],
        ];
        const leak = run(thin).leaks.find(item => item.edgeCode === 'e1');
        expect(FUNNEL_GAP_DEFAULTS.minN).toBe(8);
        expect(leak?.hidden).toBe(true);
        expect(leak?.expected).toBeNull();
        expect(leak?.ci90).toBeNull();
        expect(leak?.reason).toBe('low-n');
        expect(leak?.leak).toBe(false);
    });

    it('«закрывателю» утечка по первому ребру не ставится', () => {
        const closer: readonly FunnelEdgeInput[] = [
            { ...EDGES[0], successes: 40 },
            { ...EDGES[1], successes: 12 },
        ];
        const result = run(closer);
        expect(result.expectedGap).toBeLessThan(0);
        const first = result.leaks.find(leak => leak.edgeCode === 'e1');
        expect(first?.leak).toBe(false);
        expect(first?.reason).toBe('outcomes-at-norm');
    });

    it('разрыв ниже практического порога утечкой не считается', () => {
        const tiny: readonly FunnelEdgeInput[] = [
            { ...EDGES[0], successes: 35 },
            EDGES[1],
        ];
        const leak = run(tiny).leaks.find(item => item.edgeCode === 'e1');
        expect(Math.abs(leak?.delta ?? 1)).toBeLessThan(
            FUNNEL_GAP_DEFAULTS.practicalDelta,
        );
        expect(leak?.leak).toBe(false);
        expect(leak?.reason).toBe('below-practical');
    });
});

describe('mulberry32 — детерминированный поток', () => {
    it('один seed даёт одну и ту же последовательность', () => {
        const first = mulberry32(SEED);
        const second = mulberry32(SEED);
        const left = [first(), first(), first()];
        const right = [second(), second(), second()];
        expect(left).toEqual(right);
        expect(left.every(value => value >= 0 && value < 1)).toBe(true);
    });
});
