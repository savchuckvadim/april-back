import { newcombeDifference } from '../model/edge-rate';
import {
    buildRecommendationEffect,
    RECOMMENDATION_EFFECT_DEFAULTS,
    RECOMMENDATION_EFFECT_PARAM_CODES,
    resolveRecommendationEffectParams,
} from '../model/recommendation-effect';
import { aggregateBeforeAfter } from '../model/recommendation-effect.aggregate';
import { AI_ANALYTICS_PARAM_CODES } from '../params/registry.const';
import { registryRangeOf } from '../params/registry.access';
import { issuedOf } from './recommendation-effect.fixture';

/**
 * Окна «до/после» (Фаза 4, П18; план §10 L5): единица наблюдения —
 * окно менеджер × месяц выдачи. Несколько советов одному менеджеру в один
 * месяц смотрят на одни и те же рёбра, поэтому в суммы окно входит один
 * раз — иначе `n` завышается и интервал Ньюкомба сужается. Плюс обрезка
 * всех параметров по диапазонам реестра.
 */
const Z = 1.645;
const MIN_N = RECOMMENDATION_EFFECT_DEFAULTS.minN;

describe('aggregateBeforeAfter — окно менеджер × месяц входит один раз', () => {
    const sample = {
        before: { offer: { s: 4, n: 35 } },
        after: { offer: { s: 12, n: 35 } },
    };
    const twoInOneMonth = [
        issuedOf({ key: 'volume:a:::', ...sample }),
        issuedOf({ key: 'quality:b:::', lever: 'quality', ...sample }),
    ];

    it('два совета одному менеджеру в один месяц — одно окно, не два', () => {
        const [offer] = aggregateBeforeAfter(twoInOneMonth, Z, MIN_N);
        expect(offer).toEqual({
            edge: 'offer',
            before: { s: 4, n: 35 },
            after: { s: 12, n: 35 },
            diff: 12 / 35 - 4 / 35,
            ci90: newcombeDifference(
                { successes: 12, exposure: 35 },
                { successes: 4, exposure: 35 },
                Z,
            ),
            n: 1,
        });
    });

    it('интервал по одному окну шире, чем при двойном счёте того же окна', () => {
        const [once] = aggregateBeforeAfter(twoInOneMonth, Z, MIN_N);
        const doubled = newcombeDifference(
            { successes: 24, exposure: 70 },
            { successes: 8, exposure: 70 },
            Z,
        );
        expect(once.ci90).not.toBeNull();
        expect(doubled).not.toBeNull();
        expect(once.ci90?.[0]).toBeLessThan(doubled?.[0] ?? 0);
        expect(once.ci90?.[1]).toBeGreaterThan(doubled?.[1] ?? 0);
    });

    it('другой месяц или другой менеджер — отдельные окна', () => {
        const [offer] = aggregateBeforeAfter(
            [
                ...twoInOneMonth,
                issuedOf({
                    key: 'volume:c:::',
                    monthKey: '2026-04',
                    ...sample,
                }),
                issuedOf({ key: 'volume:d:::', managerId: 'm2', ...sample }),
            ],
            Z,
            MIN_N,
        );
        expect(offer.n).toBe(3);
        expect(offer.before).toEqual({ s: 12, n: 105 });
        expect(offer.after).toEqual({ s: 36, n: 105 });
    });

    it('окно считается по ребру: разные рёбра одного окна независимы', () => {
        const edges = aggregateBeforeAfter(
            [
                issuedOf({ key: 'volume:a:::', ...sample }),
                issuedOf({
                    key: 'volume:b:::',
                    before: { invoice: { s: 1, n: 10 } },
                    after: { invoice: { s: 3, n: 10 } },
                }),
            ],
            Z,
            MIN_N,
        );
        expect(edges.map(edge => [edge.edge, edge.n])).toEqual([
            ['invoice', 1],
            ['offer', 1],
        ]);
    });

    it('в общем своде и в своде по рычагу окно тоже одно', () => {
        const effect = buildRecommendationEffect({
            issued: twoInOneMonth,
            params: { z: Z },
        });
        expect(effect.beforeAfter[0].n).toBe(1);
        expect(effect.beforeAfter[0].before).toEqual({ s: 4, n: 35 });
        for (const lever of effect.byLever) {
            expect(lever.beforeAfter[0].n).toBe(1);
        }
    });

    it('представитель окна не зависит от порядка входа: больший n, затем s', () => {
        const small = issuedOf({
            key: 'volume:a:::',
            before: { offer: { s: 1, n: 10 } },
            after: { offer: { s: 2, n: 10 } },
        });
        const large = issuedOf({
            key: 'volume:a:::',
            before: { offer: { s: 3, n: 12 } },
            after: { offer: { s: 6, n: 12 } },
        });
        const direct = aggregateBeforeAfter([small, large], Z, MIN_N);
        const reversed = aggregateBeforeAfter([large, small], Z, MIN_N);
        expect(reversed).toEqual(direct);
        expect(direct[0]).toMatchObject({
            before: { s: 3, n: 12 },
            after: { s: 6, n: 12 },
            n: 1,
        });
    });

    it('незакрытое окно не занимает ключ окна за закрытым', () => {
        const [offer] = aggregateBeforeAfter(
            [
                issuedOf({ key: 'volume:a:::', ...sample, after: null }),
                issuedOf({ key: 'volume:b:::', ...sample }),
            ],
            Z,
            MIN_N,
        );
        expect(offer.n).toBe(1);
        expect(offer.after).toEqual({ s: 12, n: 35 });
    });
});

describe('aggregateBeforeAfter — малая выборка без разности (n_min_none)', () => {
    it('одно окно «0 из 1 → 1 из 1» — выборки есть, разности и интервала нет', () => {
        const [offer] = aggregateBeforeAfter(
            [
                issuedOf({
                    key: 'volume:a:::',
                    before: { offer: { s: 0, n: 1 } },
                    after: { offer: { s: 1, n: 1 } },
                }),
            ],
            Z,
            MIN_N,
        );
        expect(offer).toEqual({
            edge: 'offer',
            before: { s: 0, n: 1 },
            after: { s: 1, n: 1 },
            diff: null,
            ci90: null,
            n: 1,
        });
    });

    it('мало только «после» — разности тоже нет', () => {
        const [offer] = aggregateBeforeAfter(
            [
                issuedOf({
                    key: 'volume:a:::',
                    before: { offer: { s: 5, n: MIN_N + 10 } },
                    after: { offer: { s: 1, n: MIN_N - 1 } },
                }),
            ],
            Z,
            MIN_N,
        );
        expect(offer.diff).toBeNull();
        expect(offer.ci90).toBeNull();
    });

    it('ровно n_min_none в обоих окнах — разность считается', () => {
        const [offer] = aggregateBeforeAfter(
            [
                issuedOf({
                    key: 'volume:a:::',
                    before: { offer: { s: 1, n: MIN_N } },
                    after: { offer: { s: 3, n: MIN_N } },
                }),
            ],
            Z,
            MIN_N,
        );
        expect(offer.diff).toBeCloseTo(2 / MIN_N, 12);
        expect(offer.ci90).not.toBeNull();
    });

    it('в buildRecommendationEffect порог берётся из params.minN — и в своде по рычагу', () => {
        const effect = buildRecommendationEffect({
            issued: [
                issuedOf({
                    key: 'volume:a:::',
                    before: { offer: { s: 2, n: 5 } },
                    after: { offer: { s: 4, n: 5 } },
                }),
            ],
            params: { z: Z, minN: 6 },
        });
        expect(effect.beforeAfter[0].diff).toBeNull();
        expect(effect.byLever[0].beforeAfter[0].diff).toBeNull();
        expect(effect.gate.reasons).toContain('no-positive-edge');
    });
});

describe('resolveRecommendationEffectParams — все коды и диапазоны', () => {
    it('коды параметров существуют в реестре', () => {
        const registry = new Set<string>(AI_ANALYTICS_PARAM_CODES);
        for (const code of Object.values(RECOMMENDATION_EFFECT_PARAM_CODES)) {
            expect(registry.has(code)).toBe(true);
        }
    });

    it('minN и z обрезаются по диапазонам n_min_none и z_compare', () => {
        const minNRange = registryRangeOf(
            RECOMMENDATION_EFFECT_PARAM_CODES.minN,
        );
        const zRange = registryRangeOf(RECOMMENDATION_EFFECT_PARAM_CODES.z);
        expect(minNRange).toBeDefined();
        expect(zRange).toBeDefined();
        const resolved = resolveRecommendationEffectParams({
            minN: 0,
            z: 100,
        });
        expect(resolved.minN).toBe(minNRange?.[0]);
        expect(resolved.z).toBe(zRange?.[1]);
        expect(resolved.minIssued).toBe(
            RECOMMENDATION_EFFECT_DEFAULTS.minIssued,
        );
    });
});
