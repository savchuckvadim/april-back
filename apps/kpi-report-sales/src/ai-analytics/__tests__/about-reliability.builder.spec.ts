import { registryDefault } from '@lib/sales-ai-analytics';
import { buildAboutReliability } from '../about/ai-analytics-about-reliability.builder';

/**
 * Секция «надёжность оценщика» (Фаза 3, П7): отчёт согласия → DTO, порог
 * golden_kappa_min из реестра со слоем портала, чужая форма — null.
 */
const kappa = (value: number | null) => ({
    n: 200,
    categories: 4,
    weighting: 'none',
    po: 0.8,
    pe: 0.3,
    kappa: value,
    pabak: value,
});

const report = () => ({
    promptVersion: 'focus-v2.3-2026-09-25',
    pairs: 300,
    budget: { quota: 300, withinQuota: true },
    categories: [
        { code: 'callType', n: 300, nominal: kappa(0.71), weighted: null },
        {
            code: 'coachingPriority',
            n: 280,
            nominal: kappa(0.3),
            weighted: null,
        },
        {
            code: 'refusalCategory',
            n: 20,
            nominal: kappa(null),
            weighted: null,
        },
    ],
    scales: [],
    objections: {
        pairsWithObjections: 120,
        micro: {
            tp: 90,
            fp: 20,
            fn: 20,
            precision: 0.82,
            recall: 0.82,
            f1: 0.82,
        },
        byCode: [],
    },
    sigmaLlm: {
        scale: 'score',
        measured: 0.9,
        n: 300,
        minPairs: 300,
        configured: 1.2,
        source: 'measured',
        value: 0.9,
    },
});

describe('buildAboutReliability', () => {
    it('отчёт → секция: σ_llm, категории с порогом реестра, F1', () => {
        const section = buildAboutReliability(
            { payload: report(), generatedAt: '2026-09-25T04:10:00.000Z' },
            {},
        );

        expect(section).toMatchObject({
            promptVersion: 'focus-v2.3-2026-09-25',
            pairs: 300,
            withinQuota: true,
            sigmaLlm: { value: 0.9, source: 'measured', measured: 0.9, n: 300 },
            kappaMin: registryDefault('golden_kappa_min'),
            objectionsF1: 0.82,
            generatedAt: '2026-09-25T04:10:00.000Z',
        });
        expect(section?.categories).toEqual([
            { code: 'callType', n: 300, kappa: 0.71, reliable: true },
            { code: 'coachingPriority', n: 280, kappa: 0.3, reliable: false },
            { code: 'refusalCategory', n: 20, kappa: null, reliable: null },
        ]);
    });

    it('слой портала меняет порог; отчёта нет или форма чужая — null', () => {
        const section = buildAboutReliability(
            { payload: report(), generatedAt: '2026-09-25T04:10:00.000Z' },
            { portal: { golden_kappa_min: 0.75 } },
        );
        expect(section?.kappaMin).toBe(0.75);
        expect(section?.categories[0].reliable).toBe(false);

        expect(buildAboutReliability(null, {})).toBeNull();
        expect(
            buildAboutReliability(
                { payload: { что: 'угодно' }, generatedAt: 'x' },
                {},
            ),
        ).toBeNull();
    });
});
