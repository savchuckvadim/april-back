import { newcombeDifference } from '../model/edge-rate';
import {
    buildRecommendationEffect,
    RECOMMENDATION_EFFECT_DEFAULTS,
    resolveRecommendationEffectParams,
} from '../model/recommendation-effect';
import { wilsonInterval } from '../model/wilson';
import { registryDefault, registryRangeOf } from '../params/registry.access';
import {
    issuedOf,
    shuffled,
    syntheticIssued,
} from './recommendation-effect.fixture';

/**
 * Эффект советов (Фаза 4, П18; план §10 L5): доли с Уилсоном, «после − до»
 * по рёбрам с Ньюкомбом, своды по рычагам, закрытые/незакрытые окна,
 * детерминизм и деградация при малых n.
 */
const Z = 1.645;

describe('RECOMMENDATION_EFFECT_DEFAULTS — из реестра', () => {
    it('дефолты равны кодам реестра', () => {
        expect(RECOMMENDATION_EFFECT_DEFAULTS).toEqual({
            minIssued: registryDefault('recommendations_min_issued'),
            doneShareMin: registryDefault('recommendations_done_share_min'),
            disagreeMax: registryDefault('recommendations_disagree_max'),
            minN: registryDefault('n_min_none'),
            z: registryDefault('z_compare'),
        });
    });

    it('параметры обрезаются по диапазону реестра, нечисла → дефолт', () => {
        const range = registryRangeOf('recommendations_min_issued');
        expect(range).toBeDefined();
        const resolved = resolveRecommendationEffectParams({
            minIssued: 10_000,
            doneShareMin: Number.NaN,
            disagreeMax: -1,
        });
        expect(resolved.minIssued).toBe(range?.[1]);
        expect(resolved.doneShareMin).toBe(
            RECOMMENDATION_EFFECT_DEFAULTS.doneShareMin,
        );
        expect(resolved.disagreeMax).toBe(
            registryRangeOf('recommendations_disagree_max')?.[0],
        );
        expect(resolveRecommendationEffectParams(undefined)).toEqual(
            RECOMMENDATION_EFFECT_DEFAULTS,
        );
    });
});

describe('buildRecommendationEffect — доли и интервалы', () => {
    const issued = Array.from({ length: 35 }, (_, index) =>
        issuedOf({
            key: `volume:rule-${index}:::`,
            managerId: `m${index % 5}`,
            done: index < 4,
            disagree: index < 2,
            after: null,
        }),
    );
    const effect = buildRecommendationEffect({ issued, params: { z: Z } });

    it('доля выполненных 4/35 — Уилсон [0,052; 0,232]', () => {
        expect(effect.issued).toBe(35);
        expect(effect.done).toBe(4);
        expect(effect.doneShare.value).toBeCloseTo(4 / 35, 10);
        expect(effect.doneShare.ci90).toEqual(wilsonInterval(4, 35, Z));
        expect(effect.doneShare.ci90?.[0]).toBeCloseTo(0.052, 2);
        expect(effect.doneShare.ci90?.[1]).toBeCloseTo(0.232, 2);
    });

    it('доля несогласий 2/35 — тот же Уилсон', () => {
        expect(effect.disagree).toBe(2);
        expect(effect.disagreeShare).toEqual({
            value: 2 / 35,
            ci90: wilsonInterval(2, 35, Z),
            n: 35,
        });
    });

    it('без закрытых окон «после − до» пусто, completedWindows = 0', () => {
        expect(effect.completedWindows).toBe(0);
        expect(effect.beforeAfter).toEqual([]);
    });
});

describe('buildRecommendationEffect — «после − до» по рёбрам', () => {
    const closedA = issuedOf({
        key: 'volume:a:::',
        before: { offer: { s: 4, n: 35 }, invoice: { s: 2, n: 10 } },
        after: { offer: { s: 12, n: 35 }, invoice: { s: 3, n: 10 } },
    });
    const closedB = issuedOf({
        key: 'volume:b:::',
        managerId: 'm2',
        before: { offer: { s: 5, n: 30 }, sale: { s: 1, n: 5 } },
        after: { offer: { s: 11, n: 30 } },
    });
    const open = issuedOf({
        key: 'volume:c:::',
        managerId: 'm3',
        before: { offer: { s: 0, n: 100 } },
        after: null,
    });
    const effect = buildRecommendationEffect({
        issued: [open, closedB, closedA],
        params: { z: Z },
    });

    it('суммирует s и n только по советам с закрытым окном и общим ребром', () => {
        expect(effect.completedWindows).toBe(2);
        expect(effect.beforeAfter.map(edge => edge.edge)).toEqual([
            'invoice',
            'offer',
        ]);
        const offer = effect.beforeAfter[1];
        expect(offer.before).toEqual({ s: 9, n: 65 });
        expect(offer.after).toEqual({ s: 23, n: 65 });
        expect(offer.n).toBe(2);
        expect(offer.diff).toBeCloseTo(23 / 65 - 9 / 65, 12);
        expect(offer.ci90).toEqual(
            newcombeDifference(
                { successes: 23, exposure: 65 },
                { successes: 9, exposure: 65 },
                Z,
            ),
        );
        expect(offer.ci90?.[0]).toBeGreaterThan(0);
    });

    it('ребро без пары в окне «после» не участвует', () => {
        expect(effect.beforeAfter.some(edge => edge.edge === 'sale')).toBe(
            false,
        );
        expect(effect.beforeAfter[0]).toMatchObject({
            edge: 'invoice',
            before: { s: 2, n: 10 },
            after: { s: 3, n: 10 },
            n: 1,
        });
    });

    it('пустой знаменатель → diff и ci90 null', () => {
        const zero = buildRecommendationEffect({
            issued: [
                issuedOf({
                    before: { offer: { s: 0, n: 0 } },
                    after: { offer: { s: 2, n: 10 } },
                }),
            ],
        });
        expect(zero.beforeAfter).toEqual([
            {
                edge: 'offer',
                before: { s: 0, n: 0 },
                after: { s: 2, n: 10 },
                diff: null,
                ci90: null,
                n: 1,
            },
        ]);
    });

    it('s > n и отрицательные числа обрезаются', () => {
        const dirty = buildRecommendationEffect({
            issued: [
                issuedOf({
                    before: { offer: { s: -3, n: 10 } },
                    after: { offer: { s: 50, n: 10 } },
                }),
            ],
        });
        expect(dirty.beforeAfter[0].before).toEqual({ s: 0, n: 10 });
        expect(dirty.beforeAfter[0].after).toEqual({ s: 10, n: 10 });
    });
});

describe('buildRecommendationEffect — своды по рычагам', () => {
    const issued = syntheticIssued({
        seed: 'by-lever',
        issued: 60,
        closedShare: 0.7,
        doneProbability: 0.6,
        disagreeProbability: 0.1,
        edges: { offer: { before: 0.2, after: 0.4 } },
        edgeN: 30,
        levers: ['volume', 'quality'],
    });
    const effect = buildRecommendationEffect({ issued });

    it('рычаги в порядке AI_LEVERS, только с выдачей, суммы сходятся с общими', () => {
        expect(effect.byLever.map(item => item.lever)).toEqual([
            'volume',
            'quality',
        ]);
        const sum = (
            pick: 'issued' | 'done' | 'disagree' | 'completedWindows',
        ) => effect.byLever.reduce((acc, item) => acc + item[pick], 0);
        expect(sum('issued')).toBe(effect.issued);
        expect(sum('done')).toBe(effect.done);
        expect(sum('disagree')).toBe(effect.disagree);
        expect(sum('completedWindows')).toBe(effect.completedWindows);
        const offerN = effect.byLever.reduce(
            (acc, item) => acc + (item.beforeAfter[0]?.before.n ?? 0),
            0,
        );
        expect(offerN).toBe(effect.beforeAfter[0].before.n);
    });

    it('доли рычага — Уилсон по своим выданным', () => {
        for (const item of effect.byLever) {
            expect(item.doneShare).toEqual({
                value: item.done / item.issued,
                ci90: wilsonInterval(item.done, item.issued),
                n: item.issued,
            });
        }
    });
});

describe('buildRecommendationEffect — инварианты и детерминизм', () => {
    const issued = syntheticIssued({
        seed: 'invariants',
        issued: 80,
        closedShare: 0.5,
        doneProbability: 0.7,
        disagreeProbability: 0.2,
        edges: {
            offer: { before: 0.25, after: 0.35 },
            invoice: { before: 0.4, after: 0.3 },
        },
        edgeN: 20,
    });

    it('доли ∈ [0; 1], интервалы упорядочены, разность в интервале', () => {
        const effect = buildRecommendationEffect({ issued });
        for (const share of [effect.doneShare, effect.disagreeShare]) {
            expect(share.value).toBeGreaterThanOrEqual(0);
            expect(share.value).toBeLessThanOrEqual(1);
            expect(share.ci90?.[0]).toBeLessThanOrEqual(share.value ?? 0);
            expect(share.ci90?.[1]).toBeGreaterThanOrEqual(share.value ?? 1);
        }
        for (const edge of effect.beforeAfter) {
            expect(edge.ci90?.[0]).toBeLessThanOrEqual(edge.diff ?? 0);
            expect(edge.ci90?.[1]).toBeGreaterThanOrEqual(edge.diff ?? 0);
            expect(edge.diff).toBeGreaterThanOrEqual(-1);
            expect(edge.diff).toBeLessThanOrEqual(1);
        }
    });

    it('два вызова и перемешанный вход дают одинаковый результат', () => {
        const first = buildRecommendationEffect({ issued });
        const second = buildRecommendationEffect({ issued });
        const mixed = buildRecommendationEffect({
            issued: shuffled(issued, 'mix'),
        });
        expect(second).toEqual(first);
        expect(mixed).toEqual(first);
    });

    it('восстанавливает известные параметры синтетики', () => {
        const effect = buildRecommendationEffect({ issued });
        expect(effect.doneShare.value).toBeGreaterThan(0.55);
        expect(effect.doneShare.value).toBeLessThan(0.85);
        expect(effect.disagreeShare.value).toBeGreaterThan(0.08);
        expect(effect.disagreeShare.value).toBeLessThan(0.32);
        const offer = effect.beforeAfter.find(edge => edge.edge === 'offer');
        const invoice = effect.beforeAfter.find(
            edge => edge.edge === 'invoice',
        );
        expect(offer?.diff).toBeGreaterThan(0);
        expect(invoice?.diff).toBeLessThan(0);
    });

    it('ниже n_min_none ни одного числа наружу — только знаменатель', () => {
        const minN = registryDefault('n_min_none');
        const few = buildRecommendationEffect({
            issued: issued.slice(0, minN - 1),
        });
        expect(few.doneShare).toEqual({ value: null, ci90: null, n: minN - 1 });
        expect(few.disagreeShare).toEqual({
            value: null,
            ci90: null,
            n: minN - 1,
        });
        expect(few.gate.status).toBe('insufficient');
    });

    it('пустой вход — нули, без чисел, insufficient', () => {
        const empty = buildRecommendationEffect({ issued: [] });
        expect(empty.issued).toBe(0);
        expect(empty.doneShare).toEqual({ value: null, ci90: null, n: 0 });
        expect(empty.byLever).toEqual([]);
        expect(empty.beforeAfter).toEqual([]);
        expect(empty.gate.status).toBe('insufficient');
    });
});
