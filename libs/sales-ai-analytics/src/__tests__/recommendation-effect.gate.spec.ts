import {
    buildRecommendationEffect,
    goodhartClean,
    hasPositiveEdge,
    recommendationGate,
} from '../model/recommendation-effect';
import {
    RECOMMENDATION_GATE_REASONS,
    RECOMMENDATION_GATE_STATUSES,
    RECOMMENDATION_INSUFFICIENT_REASONS,
} from '../model/recommendation-effect.types';
import { syntheticIssued } from './recommendation-effect.fixture';

/**
 * Гейт L5 (план §10, §4.10): insufficient при нехватке советов, fail по
 * доле выполненных / несогласий / отсутствию положительного ребра /
 * флагам Гудхарта, pass на «хорошей» синтетике.
 */
const PARAMS = { minIssued: 20, doneShareMin: 0.5, disagreeMax: 0.3 };

const good = () =>
    syntheticIssued({
        seed: 'gate-pass',
        issued: 90,
        closedShare: 0.8,
        doneProbability: 0.85,
        disagreeProbability: 0.02,
        edges: { offer: { before: 0.2, after: 0.45 } },
        edgeN: 30,
    });

describe('словари гейта', () => {
    it('статусы и причины — as const, причины нехватки входят в общий список', () => {
        expect(RECOMMENDATION_GATE_STATUSES).toEqual([
            'pass',
            'fail',
            'insufficient',
        ]);
        for (const reason of RECOMMENDATION_INSUFFICIENT_REASONS) {
            expect(RECOMMENDATION_GATE_REASONS).toContain(reason);
        }
        expect(new Set(RECOMMENDATION_GATE_REASONS).size).toBe(
            RECOMMENDATION_GATE_REASONS.length,
        );
    });
});

describe('goodhartClean', () => {
    it('чисто только при нуле флагов и менеджеров', () => {
        expect(goodhartClean({ flags: 0, managersWithFlags: 0 })).toBe(true);
        expect(goodhartClean({ flags: 1, managersWithFlags: 1 })).toBe(false);
        expect(goodhartClean({ flags: 0, managersWithFlags: 2 })).toBe(false);
        expect(
            goodhartClean({ flags: -1, managersWithFlags: Number.NaN }),
        ).toBe(true);
    });
});

describe('hasPositiveEdge', () => {
    it('верно только при нижней границе > 0 хотя бы у одного ребра', () => {
        const edge = (ci90: readonly [number, number] | null) => ({
            edge: 'offer',
            before: { s: 1, n: 10 },
            after: { s: 2, n: 10 },
            diff: 0.1,
            ci90,
            n: 1,
        });
        expect(hasPositiveEdge([edge([0.01, 0.3])])).toBe(true);
        expect(hasPositiveEdge([edge([0, 0.3])])).toBe(false);
        expect(hasPositiveEdge([edge([-0.1, 0.3]), edge(null)])).toBe(false);
        expect(hasPositiveEdge([])).toBe(false);
    });
});

describe('гейт на синтетике', () => {
    it('pass: советов хватает, выполняют, не спорят, ребро выросло', () => {
        const effect = buildRecommendationEffect({
            issued: good(),
            params: PARAMS,
            goodhart: { flags: 0, managersWithFlags: 0 },
        });
        expect(effect.completedWindows).toBeGreaterThanOrEqual(20);
        expect(effect.gate).toEqual({ status: 'pass', reasons: [] });
    });

    it('pass без входа Гудхарта — контроль не применяется', () => {
        expect(
            buildRecommendationEffect({ issued: good(), params: PARAMS }).gate
                .status,
        ).toBe('pass');
    });

    it('insufficient: закрытых окон меньше minIssued', () => {
        const effect = buildRecommendationEffect({
            issued: good(),
            params: { ...PARAMS, minIssued: 100 },
        });
        expect(effect.gate.status).toBe('insufficient');
        expect(effect.gate.reasons).toContain('issued-below-min');
    });

    it('insufficient: окна не закрыты, хотя выданных много', () => {
        const effect = buildRecommendationEffect({
            issued: good().map(item => ({ ...item, after: null })),
            params: PARAMS,
        });
        expect(effect.completedWindows).toBe(0);
        expect(effect.gate.status).toBe('insufficient');
        expect(effect.gate.reasons).toEqual([
            'issued-below-min',
            'no-positive-edge',
        ]);
    });

    it('fail: выполняют редко → done-share-below', () => {
        const effect = buildRecommendationEffect({
            issued: good().map((item, index) => ({
                ...item,
                done: index % 4 === 0,
            })),
            params: PARAMS,
        });
        expect(effect.gate).toEqual({
            status: 'fail',
            reasons: ['done-share-below'],
        });
    });

    it('fail: несогласий много → disagree-above', () => {
        const effect = buildRecommendationEffect({
            issued: good().map((item, index) => ({
                ...item,
                disagree: index % 2 === 0,
            })),
            params: PARAMS,
        });
        expect(effect.gate).toEqual({
            status: 'fail',
            reasons: ['disagree-above'],
        });
    });

    it('disagree-above считается по верхней границе интервала, а не по точке', () => {
        const issued = good().map((item, index) => ({
            ...item,
            disagree: index % 4 === 0,
        }));
        const effect = buildRecommendationEffect({ issued, params: PARAMS });
        expect(effect.disagreeShare.value).toBeLessThan(PARAMS.disagreeMax);
        expect(effect.disagreeShare.ci90?.[1]).toBeGreaterThanOrEqual(
            PARAMS.disagreeMax,
        );
        expect(effect.gate.reasons).toContain('disagree-above');
    });

    it('fail: ребро не выросло → no-positive-edge', () => {
        const effect = buildRecommendationEffect({
            issued: syntheticIssued({
                seed: 'flat',
                issued: 90,
                closedShare: 0.8,
                doneProbability: 0.85,
                disagreeProbability: 0.02,
                edges: { offer: { before: 0.3, after: 0.3 } },
                edgeN: 30,
            }),
            params: PARAMS,
        });
        expect(effect.gate).toEqual({
            status: 'fail',
            reasons: ['no-positive-edge'],
        });
    });

    it('fail: флаги Гудхарта → goodhart-flags', () => {
        const effect = buildRecommendationEffect({
            issued: good(),
            params: PARAMS,
            goodhart: { flags: 2, managersWithFlags: 1 },
        });
        expect(effect.gate).toEqual({
            status: 'fail',
            reasons: ['goodhart-flags'],
        });
    });

    it('причины копятся в фиксированном порядке, нехватка данных важнее провала', () => {
        const gate = recommendationGate({
            completedWindows: 3,
            doneShare: { value: 0.1, ci90: [0.02, 0.3], n: 10 },
            disagreeShare: { value: 0.5, ci90: [0.3, 0.7], n: 10 },
            beforeAfter: [],
            goodhart: { flags: 1, managersWithFlags: 1 },
            params: { ...PARAMS, minN: 8, z: 1.645 },
        });
        expect(gate).toEqual({
            status: 'insufficient',
            reasons: [
                'issued-below-min',
                'done-share-below',
                'disagree-above',
                'no-positive-edge',
                'goodhart-flags',
            ],
        });
    });

    it('гейт детерминирован', () => {
        const input = { issued: good(), params: PARAMS };
        expect(buildRecommendationEffect(input).gate).toEqual(
            buildRecommendationEffect(input).gate,
        );
    });
});
