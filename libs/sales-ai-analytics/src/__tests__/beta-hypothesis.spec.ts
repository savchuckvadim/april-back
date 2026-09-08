import type { QualityHypothesisPair } from '../contracts/quality-link.types';
import {
    HYPOTHESIS_DEFAULTS,
    fitHypothesisBeta,
    hypothesisFan,
    hypothesisRequiredVolume,
    hypothesisVsData,
} from '../model/beta-hypothesis';
import { buildQualityLink, qualityMultiplier } from '../model/qav';

/** Пары гипотезы портала из приёмки §6: «30 при 8/10» и «50 при 5/10». */
const PAIRS: readonly QualityHypothesisPair[] = [
    { s: 8, n: 30 },
    { s: 5, n: 50 },
];

/** Пары P2-18 — только проверка механики МНК, β = 0,255, а не 0,17. */
const MECHANICS_PAIRS: readonly QualityHypothesisPair[] = [
    { s: 7, n: 30 },
    { s: 5, n: 50 },
];

/**
 * Качество «сейчас» для калькулятора «что если».
 *
 * ⚠ 4,8 — **условная точка калькулятора**, не калибровка и не `s_ref`:
 * значение задано константой фикстуры, чтобы ожидание `N_req ≈ 52`
 * не «подгонялось» под модель (план §6, вопрос 1 §9).
 */
const S_CURRENT_WHAT_IF = 4.8;

/** Качество опорной пары «30 презентаций при 8/10». */
const S_TARGET_ANCHOR = 8;

describe('fitHypothesisBeta — МНК по логарифмам', () => {
    it('пары «30 при 8» и «50 при 5» дают β_h = ln(50/30)/3 ≈ 0,170', () => {
        const fit = fitHypothesisBeta(PAIRS);
        expect(fit.beta).toBeCloseTo(Math.log(50 / 30) / 3, 10);
        expect(fit.beta).toBeCloseTo(0.17, 2);
        expect(fit.consistent).toBe(true);
        expect(fit.spreadPct).toBe(0);
        expect(fit.pairs.map(pair => pair.s)).toEqual([5, 8]);
    });

    it('пары P2-18 (7; 30) и (5; 50) дают 0,255 — только механика МНК', () => {
        const fit = fitHypothesisBeta(MECHANICS_PAIRS);
        expect(fit.beta).toBeCloseTo(Math.log(50 / 30) / 2, 10);
        expect(fit.beta).toBeCloseTo(0.255, 3);
        expect(fit.beta).not.toBeCloseTo(0.17, 2);
    });

    it('несогласованные пары помечаются consistent: false', () => {
        const fit = fitHypothesisBeta([
            { s: 5, n: 50 },
            { s: 7, n: 30 },
            { s: 9, n: 45 },
        ]);
        expect(fit.consistent).toBe(false);
        expect(fit.spreadPct).toBeGreaterThan(HYPOTHESIS_DEFAULTS.maxSpreadPct);
    });

    it('меньше двух валидных пар — гипотезы нет', () => {
        expect(fitHypothesisBeta([{ s: 8, n: 30 }]).consistent).toBe(false);
        const filtered = fitHypothesisBeta([
            { s: 2, n: 30 },
            { s: 5, n: 0 },
            { s: 8, n: 30 },
        ]);
        expect(filtered.pairs).toHaveLength(1);
        expect(filtered.beta).toBe(0);
    });
});

describe('калькулятор «что если»', () => {
    it('N_req = 30·exp(β_h·(8 − 4,8)) ≈ 52', () => {
        const fit = fitHypothesisBeta(PAIRS);
        const required = hypothesisRequiredVolume({
            beta: fit.beta,
            anchorVolume: 30,
            sTarget: S_TARGET_ANCHOR,
            sCurrent: S_CURRENT_WHAT_IF,
        });
        expect(required).not.toBeNull();
        expect(required as number).toBeCloseTo(51.7, 1);
        expect(Math.round(required as number)).toBe(52);
    });

    it('веер ±50 % строится только в режиме hypothesis', () => {
        const link = buildQualityLink({
            betaSource: 'hypothesis',
            sRef: 7,
            hypothesisBeta: fitHypothesisBeta(PAIRS).beta,
        });
        const fan = hypothesisFan(link, 5);
        expect(fan.applied).toBe(true);
        expect(fan.mid as number).toBeCloseTo(
            Math.exp(fitHypothesisBeta(PAIRS).beta * 2),
            10,
        );
        expect(fan.low as number).toBeLessThan(fan.mid as number);
        expect(fan.high as number).toBeGreaterThan(fan.mid as number);

        const none = buildQualityLink({ betaSource: 'none' });
        expect(hypothesisFan(none, 5)).toEqual({
            low: null,
            mid: null,
            high: null,
            applied: false,
        });
    });

    it('β гипотезы не создаёт множителя качества', () => {
        const link = buildQualityLink({
            betaSource: 'hypothesis',
            hypothesisBeta: 0.17,
        });
        expect(qualityMultiplier(link, S_CURRENT_WHAT_IF)).toMatchObject({
            value: 1,
            applied: false,
        });
    });
});

describe('hypothesisVsData — проверка на шкале вероятности', () => {
    const pHat = (score: number) => (score >= 8 ? 0.5 : 0.36);

    it('пары согласны, если интервалы p̂·N имеют общую точку', () => {
        const ci = (score: number): readonly [number, number] =>
            score >= 8 ? [0.45, 0.55] : [0.3, 0.42];
        const result = hypothesisVsData(PAIRS, pHat, ci);
        expect(result.agrees).toBe(true);
        expect(result.rows.map(row => row.expected)).toEqual([15, 18]);
        expect(result.rows.every(row => row.agrees)).toBe(true);
    });

    it('расхождение с данными видно по непересекающимся интервалам', () => {
        const ci = (score: number): readonly [number, number] =>
            score >= 8 ? [0.45, 0.55] : [0.4, 0.5];
        const result = hypothesisVsData(PAIRS, pHat, ci);
        expect(result.agrees).toBe(false);
        expect(result.rows.every(row => row.agrees)).toBe(false);
    });

    it('без интервала p̂ пара не считается согласованной', () => {
        const result = hypothesisVsData(
            PAIRS,
            () => null,
            () => null,
        );
        expect(result.agrees).toBe(false);
        expect(result.rows.every(row => row.expected === null)).toBe(true);
    });
});
