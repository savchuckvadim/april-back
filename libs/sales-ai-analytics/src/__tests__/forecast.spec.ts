import {
    PipelineEpisode,
    ceilingForecast,
    forecastP50,
    newFlowExpected,
    pipelineExpected,
} from '../model/forecast';
import { exponentialLagCdf, lagCdfFromTable } from '../model/lag-cdf';

/**
 * Описательный прогноз месяца (план §4.8; Фаза 2, поток
 * `p2-model-forecast-plan`).
 *
 * Главное здесь — cure-форма ожидания от пайплайна: знаменатель
 * `1 − θ·F(age)` учитывает, что дожитие сделки до возраста `age` повышает
 * вероятность быть «не покупателем». Формула v2 с `/(1 − F(age))` на
 * типичной застоявшейся сделке завышала ожидание в семь раз.
 */

/** Таблица `F(d)` иллюстрации 4.8: F(40) = 0,9, F(52) = 0,97. */
const ILLUSTRATION_CDF = lagCdfFromTable([
    { days: 40, value: 0.9 },
    { days: 52, value: 0.97 },
    { days: 400, value: 1 },
]);

/** Застоявшаяся сделка из иллюстрации: возраст 40 дней, θ = 0,3. */
const STUCK_DEAL: PipelineEpisode = { id: 'd-1', ageDays: 40, theta: 0.3 };

/** Остаток горизонта иллюстрации — 12 дней (40 + 12 = 52). */
const DAYS_REMAINING = 12;

describe('pipelineExpected — cure-форма', () => {
    it('иллюстрация 4.8: age 40, θ = 0,3, F(40) = 0,9, F(52) = 0,97 → ≈ 0,03', () => {
        const result = pipelineExpected({
            episodes: [STUCK_DEAL],
            cdf: ILLUSTRATION_CDF,
            daysRemaining: DAYS_REMAINING,
        });
        expect(result.value).toBeCloseTo(0.0288, 4);
        expect(Number((result.value ?? 0).toFixed(2))).toBe(0.03);
        expect(result.reason).toBeUndefined();
    });

    it('формула v2 дала бы 0,21 — завышение примерно в семь раз', () => {
        const fAge = ILLUSTRATION_CDF.at(40);
        const fHorizon = ILLUSTRATION_CDF.at(40 + DAYS_REMAINING);
        const legacyV2 = (0.3 * (fHorizon - fAge)) / (1 - fAge);
        const cure =
            pipelineExpected({
                episodes: [STUCK_DEAL],
                cdf: ILLUSTRATION_CDF,
                daysRemaining: DAYS_REMAINING,
            }).value ?? 0;
        expect(legacyV2).toBeCloseTo(0.21, 2);
        expect(legacyV2 / cure).toBeGreaterThan(7);
        expect(legacyV2 / cure).toBeLessThan(7.5);
    });

    it('вклады эпизодов складываются, пустой пайплайн даёт ноль', () => {
        const two = pipelineExpected({
            episodes: [STUCK_DEAL, STUCK_DEAL],
            cdf: ILLUSTRATION_CDF,
            daysRemaining: DAYS_REMAINING,
        });
        expect(two.value).toBeCloseTo((0.3 * 0.07 * 2) / 0.73, 10);
        expect(
            pipelineExpected({
                episodes: [],
                cdf: ILLUSTRATION_CDF,
                daysRemaining: DAYS_REMAINING,
            }).value,
        ).toBe(0);
    });

    it('θ = 1 и F(age) = 1 не дают деления на ноль', () => {
        const result = pipelineExpected({
            episodes: [{ ageDays: 400, theta: 1 }],
            cdf: ILLUSTRATION_CDF,
            daysRemaining: DAYS_REMAINING,
        });
        expect(result.value).toBe(0);
    });
});

describe('pipelineExpected — штатная деградация', () => {
    it('без истории стадий — null с причиной no-stage-history', () => {
        const result = pipelineExpected({
            episodes: [STUCK_DEAL],
            cdf: ILLUSTRATION_CDF,
            daysRemaining: DAYS_REMAINING,
            hasStageHistory: false,
        });
        expect(result.value).toBeNull();
        expect(result.reason).toBe('no-stage-history');
    });

    it('пустой вход тоже даёт null, а не ноль', () => {
        expect(pipelineExpected(null)).toEqual({
            value: null,
            reason: 'no-stage-history',
        });
        expect(pipelineExpected(undefined).value).toBeNull();
    });
});

describe('pipelineExpected — cure и cif не смешиваются', () => {
    const mixed: PipelineEpisode = {
        ageDays: 40,
        theta: 0.3,
        cifSaleAge: 0.05,
        cifFailAge: 0.6,
        cifSaleHorizon: 0.07,
    };
    const input = {
        episodes: [mixed],
        cdf: ILLUSTRATION_CDF,
        daysRemaining: DAYS_REMAINING,
    };

    it('переключение формы меняет формулу целиком', () => {
        const cure = pipelineExpected({ ...input, estimand: 'cure' }).value;
        const cif = pipelineExpected({ ...input, estimand: 'cif' }).value;
        expect(cure).toBeCloseTo(0.0288, 4);
        // (0,07 − 0,05) / (1 − 0,05 − 0,6) — без множителя θ.
        expect(cif).toBeCloseTo(0.02 / 0.35, 6);
        expect(cure).not.toBeCloseTo(cif ?? 0, 3);
    });

    it('cure игнорирует поля CIF, cif игнорирует θ', () => {
        const cureWithoutCif = pipelineExpected({
            ...input,
            episodes: [{ ageDays: 40, theta: 0.3 }],
        }).value;
        expect(pipelineExpected({ ...input, estimand: 'cure' }).value).toBe(
            cureWithoutCif,
        );
        const cifWithoutTheta = pipelineExpected({
            ...input,
            estimand: 'cif',
            episodes: [
                {
                    ageDays: 40,
                    cifSaleAge: 0.05,
                    cifFailAge: 0.6,
                    cifSaleHorizon: 0.07,
                },
            ],
        }).value;
        expect(pipelineExpected({ ...input, estimand: 'cif' }).value).toBe(
            cifWithoutTheta,
        );
    });

    it('форма по умолчанию — cure', () => {
        expect(pipelineExpected(input).value).toBeCloseTo(0.0288, 4);
    });
});

describe('newFlowExpected', () => {
    const paths = [{ code: 'main', entryRate: 0.7, conversion: 0.09 }];

    it('λ_new = D_rem·a·Π θ·F̄', () => {
        expect(
            newFlowExpected({ paths, daysRemaining: 12, fBar: 0.14 }),
        ).toBeCloseTo(12 * 0.7 * 0.09 * 0.14, 10);
    });

    it('λ_new = 0 при D_rem = 0 — деления на ноль нет', () => {
        expect(newFlowExpected({ paths, daysRemaining: 0, fBar: 0.14 })).toBe(
            0,
        );
        expect(newFlowExpected({ paths, daysRemaining: -5, fBar: 0.14 })).toBe(
            0,
        );
    });

    it('множитель качества применяется только когда передан', () => {
        const base = newFlowExpected({ paths, daysRemaining: 12, fBar: 0.14 });
        const withQuality = newFlowExpected({
            paths,
            daysRemaining: 12,
            fBar: 0.14,
            qualityMultiplier: 1.2,
        });
        expect(withQuality).toBeCloseTo(base * 1.2, 10);
    });

    it('пути складываются', () => {
        expect(
            newFlowExpected({
                paths: [
                    { code: 'a', entryRate: 1, conversion: 0.1 },
                    { code: 'b', entryRate: 2, conversion: 0.05 },
                ],
                daysRemaining: 10,
                fBar: 0.5,
            }),
        ).toBeCloseTo(10 * (0.1 + 0.1) * 0.5, 10);
    });
});

describe('forecastP50', () => {
    it('P50 = Y₀ + λ_pipe + λ_new, описательная часть — без λ_new', () => {
        const result = forecastP50({
            doneSales: 2,
            pipelineExpected: 0.6,
            newFlowExpected: 0.4,
            daysElapsed: 10,
            daysRemaining: 10,
        });
        expect(result.p50).toBeCloseTo(3, 10);
        expect(result.descriptive).toBeCloseTo(2.6, 10);
        expect(result.naive).toBeCloseTo(4, 10);
        expect(result.pipelineKnown).toBe(true);
    });

    it('без пайплайна прогноз считается без него и помечает это', () => {
        const result = forecastP50({
            doneSales: 2,
            pipelineExpected: null,
            newFlowExpected: 0.4,
            daysElapsed: 10,
            daysRemaining: 10,
        });
        expect(result.pipelineKnown).toBe(false);
        expect(result.descriptive).toBeCloseTo(2, 10);
        expect(result.p50).toBeCloseTo(2.4, 10);
    });

    it('в первый день месяца наивная база — факт прошлого месяца', () => {
        const result = forecastP50({
            doneSales: 0,
            pipelineExpected: 0,
            newFlowExpected: 1,
            daysElapsed: 0,
            daysRemaining: 20,
            lastMonthSales: 5,
        });
        expect(result.naive).toBe(5);
        expect(Number.isFinite(result.naive)).toBe(true);
    });
});

describe('ceilingForecast — два числа РОПу', () => {
    const input = {
        doneSales: 0,
        pipelineExpected: 0.6,
        daysRemaining: 12,
        expectedRate: 0.7,
        cap: 3,
        conversion: 0.09,
        fBar: 0.14,
    };

    it('иллюстрация 4.9: G′_expected ≈ 0,7 и G′_ceiling ≈ 1,05', () => {
        const result = ceilingForecast(input);
        expect(result.expected).toBeCloseTo(0.70584, 5);
        expect(Number(result.expected.toFixed(1))).toBe(0.7);
        expect(result.ceiling).toBeCloseTo(1.0536, 4);
        expect(Number(result.ceiling.toFixed(2))).toBe(1.05);
        expect(result.ceiling).toBeGreaterThan(result.expected);
    });

    it('без оценки capacity потолок совпадает с ожиданием', () => {
        const result = ceilingForecast({ ...input, cap: null });
        expect(result.ceiling).toBeCloseTo(result.expected, 10);
    });

    it('согласовано с λ_new: потолок — тот же поток при темпе cap', () => {
        const flowAtCap = newFlowExpected({
            paths: [{ code: 'ceiling', entryRate: 3, conversion: 0.09 }],
            daysRemaining: 12,
            fBar: 0.14,
        });
        expect(ceilingForecast(input).ceiling).toBeCloseTo(0.6 + flowAtCap, 10);
    });

    it('на экспоненте медианы 28 числа остаются конечными', () => {
        const cdf = exponentialLagCdf(28);
        const result = ceilingForecast({ ...input, fBar: cdf.at(12) });
        expect(Number.isFinite(result.expected)).toBe(true);
        expect(result.ceiling).toBeGreaterThan(result.expected);
    });
});
