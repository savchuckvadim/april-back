import {
    RELIABILITY_DEFAULTS,
    canOrderPair,
    correctForReliability,
    groupManagers,
    icc21,
    resolveSigmaLlm,
    seOfMean,
    sigmaFromRetest,
    spearmanBrown,
} from '../model/reliability';
import { mulberry32 } from './lite-row.fixture';

/** Детерминированный нормальный шум (Бокс–Мюллер поверх mulberry32). */
function normals(seed: number, count: number): number[] {
    const random = mulberry32(seed);
    return Array.from({ length: count }, () => {
        const u1 = Math.max(random(), Number.EPSILON);
        const u2 = random();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    });
}

describe('sigmaFromRetest', () => {
    it('σ_llm = √(½·mean((S¹ − S²)²))', () => {
        const pairs = [
            { first: 7, second: 8 },
            { first: 6, second: 5 },
            { first: 9, second: 10 },
            { first: 4, second: 3 },
        ];
        expect(sigmaFromRetest(pairs)).toBeCloseTo(Math.SQRT1_2, 6);
    });

    it('идеальное совпадение прогонов → 0; пустой набор → null', () => {
        expect(sigmaFromRetest([{ first: 7, second: 7 }])).toBe(0);
        expect(sigmaFromRetest([])).toBeNull();
    });
});

describe('resolveSigmaLlm', () => {
    it('до измерения — 1,2 (configured) с пометкой «надёжность не измерена»', () => {
        const sigma = resolveSigmaLlm(null);
        expect(sigma.value).toBe(1.2);
        expect(sigma.source).toBe('configured');
        expect(sigma.note).toBe(RELIABILITY_DEFAULTS.notMeasuredNote);
    });

    it('измеренное значение — measured без пометки', () => {
        const sigma = resolveSigmaLlm(0.8);
        expect(sigma).toEqual({ value: 0.8, source: 'measured' });
    });
});

describe('seOfMean', () => {
    it('числа плана: σ_skill = σ_llm = 1,2, n = 20 → SE(S̄) ≈ 0,38', () => {
        const se = seOfMean({ sigmaSkill: 1.2, sigmaLlm: 1.2, n: 20 });
        expect(se).toBeCloseTo(0.3795, 4);
        expect(Math.abs((se ?? 0) - 0.38)).toBeLessThan(0.005);
    });

    it('σ_llm по умолчанию — дефолт реестра 1,2; n ≤ 0 → null', () => {
        expect(seOfMean({ sigmaSkill: 1.2, n: 20 })).toBeCloseTo(0.3795, 4);
        expect(seOfMean({ sigmaSkill: 1.2, n: 0 })).toBeNull();
    });
});

describe('icc21', () => {
    it('синтетика с известной дисперсией: σ²_между/(σ²_между + σ²_внутри) = 0,8', () => {
        const subjectCount = 600;
        const between = normals(20260907, subjectCount).map(z => 7 + 1.2 * z);
        const noise = normals(1, subjectCount * 2);
        const groups = between.map((trueScore, index) => ({
            key: `c${index}`,
            ratings: [
                trueScore + 0.6 * noise[index * 2],
                trueScore + 0.6 * noise[index * 2 + 1],
            ],
        }));
        const icc = icc21(groups);
        expect(icc).not.toBeNull();
        expect(icc ?? 0).toBeCloseTo(0.8, 1);
    });

    it('оценщики без общего сигнала → ICC близок к нулю', () => {
        const noise = normals(7, 800);
        const groups = Array.from({ length: 400 }, (_, index) => ({
            key: `c${index}`,
            ratings: [7 + noise[index * 2], 7 + noise[index * 2 + 1]],
        }));
        expect(icc21(groups) ?? 1).toBeLessThan(0.1);
    });

    it('неполная матрица, один прогон или один объект → null', () => {
        expect(icc21([])).toBeNull();
        expect(icc21([{ key: 'c1', ratings: [7, 8] }])).toBeNull();
        expect(
            icc21([
                { key: 'c1', ratings: [7] },
                { key: 'c2', ratings: [8] },
            ]),
        ).toBeNull();
        expect(
            icc21([
                { key: 'c1', ratings: [7, 8] },
                { key: 'c2', ratings: [8] },
            ]),
        ).toBeNull();
    });

    it('детерминирован: тот же seed — тот же результат', () => {
        const build = (): { key: string; ratings: number[] }[] => {
            const z = normals(42, 200);
            return Array.from({ length: 100 }, (_, index) => ({
                key: `c${index}`,
                ratings: [
                    7 + z[index * 2],
                    7 + z[index * 2] + z[index * 2 + 1],
                ],
            }));
        };
        expect(icc21(build())).toBe(icc21(build()));
    });
});

describe('spearmanBrown', () => {
    it('r_n = n·ICC/(1 + (n−1)·ICC)', () => {
        expect(spearmanBrown(0.7, 1)).toBeCloseTo(0.7, 6);
        expect(spearmanBrown(0.7, 10)).toBeCloseTo(7 / 7.3, 6);
        expect(spearmanBrown(0.7, 2)).toBeCloseTo(1.4 / 1.7, 6);
    });

    it('надёжность растёт с n и не выходит за 1; ICC ≤ 0 → 0', () => {
        expect(spearmanBrown(0.7, 2)).toBeGreaterThan(spearmanBrown(0.7, 1));
        expect(spearmanBrown(0.7, 1000)).toBeLessThanOrEqual(1);
        expect(spearmanBrown(0, 10)).toBe(0);
        expect(spearmanBrown(-0.2, 10)).toBe(0);
        expect(spearmanBrown(0.7, 0)).toBe(0);
    });
});

describe('groupManagers', () => {
    const input = {
        reference: 6,
        sigmaSkill: 1.2,
        sigmaLlm: 1.2,
        managers: [
            { managerId: 'm3', mean: 7.5, n: 50 },
            { managerId: 'm1', mean: 6.5, n: 50 },
            { managerId: 'm2', mean: 4.0, n: 50 },
            { managerId: 'm4', mean: 9.0, n: 5 },
        ],
    };

    it('группы по интервалам и практическому порогу 1 балл, порядок — по id', () => {
        const result = groupManagers(input);
        expect(result.groups.map(item => item.managerId)).toEqual([
            'm1',
            'm2',
            'm3',
            'm4',
        ]);
        const byId = new Map(result.groups.map(item => [item.managerId, item]));
        expect(byId.get('m3')?.group).toBe('above');
        expect(byId.get('m2')?.group).toBe('below');
        // Интервал выше нормы, но |Δ| = 0,5 < 1 балла — «на уровне».
        expect(byId.get('m1')?.group).toBe('level');
        expect(byId.get('m4')?.group).toBe('unknown');
    });

    it('это группы, а не рейтинг: порядок результата не зависит от значений', () => {
        const reversed = groupManagers({
            ...input,
            managers: [...input.managers].reverse(),
        });
        expect(reversed.groups.map(item => item.managerId)).toEqual([
            'm1',
            'm2',
            'm3',
            'm4',
        ]);
    });

    it('без измеренного σ_llm результат помечен «надёжность не измерена»', () => {
        const result = groupManagers({ ...input, sigmaLlm: undefined });
        expect(result.sigmaLlm.source).toBe('configured');
        expect(result.sigmaLlm.note).toBe(RELIABILITY_DEFAULTS.notMeasuredNote);
        expect(result.groups[0].se).toBeCloseTo(
            seOfMean({ sigmaSkill: 1.2, n: 50 }) ?? 0,
            9,
        );
    });
});

describe('canOrderPair', () => {
    const pair = (n: number, deltaHalf: number) =>
        groupManagers({
            reference: 7,
            sigmaSkill: 1.2,
            sigmaLlm: 1.2,
            managers: [
                { managerId: 'a', mean: 7 + deltaHalf, n },
                { managerId: 'b', mean: 7 - deltaHalf, n },
            ],
        }).groups;

    it('числа плана: n = 20, |Δ| = 0,9 — менеджеры не разделяются', () => {
        const [a, b] = pair(20, 0.45);
        const verdict = canOrderPair(a, b);
        expect(a.se).toBeCloseTo(0.3795, 4);
        expect(verdict.delta).toBeCloseTo(0.9, 6);
        expect(verdict.seDiff).toBeCloseTo(0.5367, 4);
        expect(2 * (verdict.seDiff ?? 0)).toBeGreaterThan(0.9);
        expect(verdict.separated).toBe(false);
        // n < n_min_rating = 50 — порядок запрещён и по объёму данных.
        expect(verdict.reason).toBe('few-data');
        expect(a.orderAllowed).toBe(false);
    });

    it('n ≥ 50, но |Δ| ≤ 2·SE разности → within-noise', () => {
        const [a, b] = pair(50, 0.15);
        const verdict = canOrderPair(a, b);
        expect(a.orderAllowed).toBe(true);
        expect(verdict.separated).toBe(false);
        expect(verdict.reason).toBe('within-noise');
    });

    it('n ≥ 50 и |Δ| > 2·SE разности → порядок допустим', () => {
        const [a, b] = pair(50, 1.2);
        const verdict = canOrderPair(a, b);
        expect(verdict.delta).toBeCloseTo(2.4, 6);
        expect(verdict.separated).toBe(true);
        expect(verdict.reason).toBeUndefined();
    });
});

describe('correctForReliability (regression calibration, §4.4)', () => {
    it('надёжность не измерена → величина эффекта скрыта', () => {
        const result = correctForReliability(0.17, null);

        expect(result.beta).toBeNull();
        expect(result.hidden).toBe(true);
        expect(result.reason).toBe('reliability-unknown');
        expect(result.betaObserved).toBeCloseTo(0.17, 9);
        expect(resolveSigmaLlm(null).note).toBe('reliability-not-measured');
    });

    it('измеренная надёжность возвращает наклон: β_true = β/r', () => {
        const result = correctForReliability(0.14, spearmanBrown(0.2, 20));

        expect(result.hidden).toBe(false);
        expect(result.reliability).toBeCloseTo(20 / 24, 9);
        expect(result.beta).toBeCloseTo(0.14 / (20 / 24), 9);
    });

    it('неположительная надёжность тоже скрывает величину эффекта', () => {
        const result = correctForReliability(0.3, 0);

        expect(result.beta).toBeNull();
        expect(result.reason).toBe('reliability-too-low');
    });
});

describe('группы и порядок при малых n (§4.3)', () => {
    const pair = {
        reference: 6.5,
        sigmaSkill: 1.2,
        sigmaLlm: 1.2,
        managers: [
            { managerId: 'm1', mean: 7.0, n: 20 },
            { managerId: 'm2', mean: 6.1, n: 20 },
        ],
    };

    it('два менеджера с |Δ| = 0,9 при n = 20 попадают в одну группу', () => {
        const result = groupManagers(pair);

        expect(result.groups.map(group => group.group)).toEqual([
            'level',
            'level',
        ]);
        expect(result.groups[0].se).toBeCloseTo(0.38, 2);
        expect(canOrderPair(result.groups[0], result.groups[1]).separated).toBe(
            false,
        );
    });

    it('n = 49 — порядка нет даже при большой разнице', () => {
        const result = groupManagers({
            ...pair,
            managers: [
                { managerId: 'm1', mean: 9.0, n: 49 },
                { managerId: 'm2', mean: 4.0, n: 49 },
            ],
        });
        const verdict = canOrderPair(result.groups[0], result.groups[1]);

        expect(result.groups.every(group => group.orderAllowed)).toBe(false);
        expect(verdict.separated).toBe(false);
        expect(verdict.reason).toBe('few-data');
    });
});
