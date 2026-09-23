import { isGoldenReportLike } from '../../../contracts/golden-report.types';
import {
    AI_ANALYTICS_PARAM_DEFAULTS,
    findParam,
} from '../../../params/registry.const';
import { mulberry32 } from '../../prng';
import {
    AgreementPair,
    AgreementRun,
    buildGoldenReport,
    categoryPairsOf,
    scalePairsOf,
    sigmaOfPairs,
} from '../agreement-report';
import { AGREEMENT_DEFAULTS } from '../agreement.types';

const CALL_TYPES = ['cold', 'warm', 'hot'] as const;
const OUTCOMES = ['deal', 'none'] as const;
const OBJECTIONS = ['price', 'time', 'trust'] as const;
const SCORE = 'score';
const PROMPT = 'rubric-v3';

/** Детерминированный прогон разбора по seed-потоку. */
const randomRun = (random: () => number): AgreementRun => ({
    categories: {
        callType: CALL_TYPES[Math.floor(random() * 3)],
        outcome: OUTCOMES[Math.floor(random() * 2)],
    },
    scales: {
        [SCORE]: 1 + Math.floor(random() * 10),
        greeting: 1 + Math.floor(random() * 5),
    },
    objections: OBJECTIONS.filter(() => random() < 0.4),
});

/** n пар с идентичными прогонами. */
const identicalPairs = (n: number, seed = 1): AgreementPair[] => {
    const random = mulberry32(seed);
    return Array.from({ length: n }, (_, i) => {
        const run = randomRun(random);
        return { key: `t${i}`, first: run, second: run };
    });
};

const shiftScore = (run: AgreementRun, delta: number): AgreementRun => ({
    ...run,
    scales: { ...run.scales, [SCORE]: (run.scales[SCORE] ?? 0) + delta },
});

const withObjections = (
    key: string,
    first: readonly string[],
    second: readonly string[],
): AgreementPair => {
    const base = identicalPairs(1)[0].first;
    return {
        key,
        first: { ...base, objections: first },
        second: { ...base, objections: second },
    };
};

const build = (pairs: readonly AgreementPair[]) =>
    buildGoldenReport({ promptVersion: PROMPT, pairs, sigmaScale: SCORE });

describe('AGREEMENT_DEFAULTS: величины из реестра', () => {
    it('квота, σ_llm, Δ и z — дефолты кодов; ценз пар — minN sigma_llm_default', () => {
        expect(AGREEMENT_DEFAULTS.retestBudgetCalls).toBe(
            AI_ANALYTICS_PARAM_DEFAULTS.retest_budget_calls,
        );
        expect(AGREEMENT_DEFAULTS.sigmaLlmConfigured).toBe(
            AI_ANALYTICS_PARAM_DEFAULTS.sigma_llm_default,
        );
        expect(AGREEMENT_DEFAULTS.tostBound).toBe(
            AI_ANALYTICS_PARAM_DEFAULTS.delta_prac_score,
        );
        expect(AGREEMENT_DEFAULTS.z).toBe(
            AI_ANALYTICS_PARAM_DEFAULTS.z_compare,
        );
        expect(findParam('sigma_llm_default')?.minN).toBeGreaterThan(0);
        expect(AGREEMENT_DEFAULTS.minPairs).toBe(
            findParam('sigma_llm_default')?.minN,
        );
    });
});

describe('buildGoldenReport: идентичные прогоны', () => {
    const pairs = identicalPairs(40);
    const report = buildGoldenReport({
        promptVersion: PROMPT,
        pairs,
        sigmaScale: SCORE,
        ordinalLevels: { callType: CALL_TYPES },
    });

    it('κ = 1 (номинальная и взвешенная), PABAK = 1 по каждой категории', () => {
        expect(report.categories.map(item => item.code)).toEqual([
            'callType',
            'outcome',
        ]);
        for (const category of report.categories) {
            expect(category.n).toBe(40);
            expect(category.nominal.kappa).toBe(1);
            expect(category.nominal.pabak).toBe(1);
        }
        expect(report.categories[0].weighted?.kappa).toBe(1);
        expect(report.categories[0].weighted?.weighting).toBe('linear');
        expect(report.categories[1].weighted).toBeNull();
    });

    it('ICC(2,1) = ICC(3,1) = 1, TOST эквивалентен, σ = 0 по каждой шкале', () => {
        expect(report.scales.map(item => item.code)).toEqual([
            'greeting',
            SCORE,
        ]);
        for (const scale of report.scales) {
            expect(scale.n).toBe(40);
            expect(scale.icc?.icc21).toBe(1);
            expect(scale.icc?.icc31).toBe(1);
            expect(scale.tost?.equivalent).toBe(true);
            expect(scale.tost?.p).toBe(0);
            expect(scale.sigma).toBe(0);
        }
    });

    it('F1 = 1 по возражениям, микро и по кодам', () => {
        expect(report.objections.micro.f1).toBe(1);
        expect(report.objections.micro.fp + report.objections.micro.fn).toBe(0);
        expect(report.objections.pairsWithObjections).toBe(
            pairs.filter(pair => pair.first.objections.length > 0).length,
        );
        for (const item of report.objections.byCode) {
            expect(item.f1).toBe(1);
        }
    });

    it('версия, число пар, квота retest_budget_calls; σ_llm = 0 измерена, но ценз пар не пройден → configured', () => {
        expect(report.promptVersion).toBe(PROMPT);
        expect(report.pairs).toBe(40);
        expect(report.budget).toEqual({
            quota: AGREEMENT_DEFAULTS.retestBudgetCalls,
            withinQuota: true,
        });
        expect(report.sigmaLlm).toEqual({
            scale: SCORE,
            measured: 0,
            n: 40,
            minPairs: AGREEMENT_DEFAULTS.minPairs,
            configured: AGREEMENT_DEFAULTS.sigmaLlmConfigured,
            source: 'configured',
            value: AGREEMENT_DEFAULTS.sigmaLlmConfigured,
        });
    });

    it('ценз пар пройден (minPairs пар) → source measured, value = 0; квота и ценз переопределяются', () => {
        const enough = identicalPairs(AGREEMENT_DEFAULTS.minPairs);
        const measured = build(enough);
        expect(measured.sigmaLlm.source).toBe('measured');
        expect(measured.sigmaLlm.value).toBe(0);
        expect(measured.budget.withinQuota).toBe(true);
        const overQuota = buildGoldenReport({
            promptVersion: PROMPT,
            pairs: enough,
            sigmaScale: SCORE,
            quota: 10,
            minPairs: 5,
        });
        expect(overQuota.budget).toEqual({ quota: 10, withinQuota: false });
        expect(overQuota.sigmaLlm.minPairs).toBe(5);
    });
});

describe('buildGoldenReport: расхождения между прогонами', () => {
    it('постоянный сдвиг +1 по баллу: ICC(3,1) = 1, ICC(2,1) < 1, TOST при Δ = 1 не эквивалентен, σ = 0', () => {
        const pairs = identicalPairs(30).map(pair => ({
            ...pair,
            second: shiftScore(pair.second, 1),
        }));
        const report = buildGoldenReport({
            promptVersion: PROMPT,
            pairs,
            sigmaScale: SCORE,
            tostBound: 1,
        });
        const score = report.scales.find(item => item.code === SCORE);
        expect(score?.icc?.icc31).toBeCloseTo(1, 12);
        expect(score?.icc?.icc21 as number).toBeLessThan(1);
        expect(score?.tost?.mean).toBeCloseTo(-1, 12);
        expect(score?.tost?.equivalent).toBe(false);
        expect(score?.sigma).toBe(0);
        expect(report.sigmaLlm.measured).toBe(0);
    });

    it('шум ±1 по баллу через пару: σ = sd(разностей)/√2 по формуле', () => {
        const pairs = identicalPairs(20).map((pair, i) => ({
            ...pair,
            second: shiftScore(pair.second, i % 2 === 0 ? 1 : -1),
        }));
        const differences = scalePairsOf(pairs, SCORE).map(
            pair => pair.first - pair.second,
        );
        const mean =
            differences.reduce((a, b) => a + b, 0) / differences.length;
        const sd = Math.sqrt(
            differences.reduce((a, d) => a + (d - mean) ** 2, 0) /
                (differences.length - 1),
        );
        expect(sigmaOfPairs(scalePairsOf(pairs, SCORE))).toBeCloseTo(
            sd / Math.SQRT2,
            12,
        );
        expect(sigmaOfPairs([{ first: 1, second: 2 }])).toBeNull();
    });

    it('пропуски: поле без второй оценки не входит в n; коды — объединение обоих прогонов по алфавиту', () => {
        const pairs: AgreementPair[] = identicalPairs(6).map((pair, i) => ({
            ...pair,
            second: {
                ...pair.second,
                categories: {
                    ...pair.second.categories,
                    outcome: i < 2 ? null : pair.second.categories.outcome,
                    ...(i === 0 ? { zone: 'msk' } : {}),
                },
                scales: { ...pair.second.scales, greeting: i < 3 ? null : 4 },
            },
        }));
        const report = build(pairs);
        expect(report.categories.map(item => item.code)).toEqual([
            'callType',
            'outcome',
            'zone',
        ]);
        expect(report.categories[1].n).toBe(4);
        expect(report.categories[2].n).toBe(0);
        expect(report.categories[2].nominal.kappa).toBeNull();
        expect(categoryPairsOf(pairs, 'outcome')).toHaveLength(4);
        expect(report.scales.find(item => item.code === 'greeting')?.n).toBe(3);
        expect(report.scales.find(item => item.code === SCORE)?.n).toBe(6);
    });

    it('взвешивание упорядоченных категорий: quadratic по запросу; уровни вне списка не считаются', () => {
        const pairs = identicalPairs(12);
        const report = buildGoldenReport({
            promptVersion: PROMPT,
            pairs,
            sigmaScale: SCORE,
            ordinalLevels: { callType: ['cold', 'warm'] },
            weighting: 'quadratic',
        });
        const callType = report.categories.find(
            item => item.code === 'callType',
        );
        expect(callType?.weighted?.weighting).toBe('quadratic');
        expect(callType?.nominal.categories).toBe(2);
        expect(callType?.n).toBe(
            categoryPairsOf(pairs, 'callType').filter(
                pair => pair.first !== 'hot',
            ).length,
        );
    });

    it('возражения: pairsWithObjections, микро и разрез по кодам', () => {
        const report = build([
            withObjections('a', ['price', 'time'], ['price']),
            withObjections('b', [], ['trust']),
            withObjections('c', [], []),
        ]);
        expect(report.objections.pairsWithObjections).toBe(2);
        expect(report.objections.micro).toMatchObject({ tp: 1, fp: 1, fn: 1 });
        expect(report.objections.micro.f1).toBeCloseTo(0.5, 12);
        expect(report.objections.byCode.map(item => item.code)).toEqual([
            'price',
            'time',
            'trust',
        ]);
    });

    it('пустой вход: 0 пар, пустые разрезы, σ_llm configured, F1 null', () => {
        const report = build([]);
        expect(report.pairs).toBe(0);
        expect(report.categories).toEqual([]);
        expect(report.scales).toEqual([]);
        expect(report.objections.micro.f1).toBeNull();
        expect(report.sigmaLlm.source).toBe('configured');
        expect(report.sigmaLlm.measured).toBeNull();
        expect(report.sigmaLlm.value).toBe(
            AGREEMENT_DEFAULTS.sigmaLlmConfigured,
        );
    });

    it('детерминизм: та же фикстура → тот же отчёт', () => {
        expect(build(identicalPairs(15, 9))).toEqual(
            build(identicalPairs(15, 9)),
        );
    });
});

describe('isGoldenReportLike', () => {
    it('принимает собранный отчёт (и после JSON-цикла), отвергает чужие формы', () => {
        const report = build(identicalPairs(3));
        expect(isGoldenReportLike(report)).toBe(true);
        expect(isGoldenReportLike(JSON.parse(JSON.stringify(report)))).toBe(
            true,
        );
        expect(isGoldenReportLike(null)).toBe(false);
        expect(
            isGoldenReportLike({
                ...report,
                sigmaLlm: { ...report.sigmaLlm, source: 'guess' },
            }),
        ).toBe(false);
        expect(isGoldenReportLike({ ...report, categories: 'none' })).toBe(
            false,
        );
        expect(
            isGoldenReportLike({
                ...report,
                objections: { micro: null, byCode: [] },
            }),
        ).toBe(false);
    });
});
