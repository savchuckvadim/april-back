import {
    METRIC_CONFIDENCE_REASONS,
    confidenceFor,
    rateMetric,
    scoreMetric,
} from '../model/metric';
import { AI_ANALYTICS_THRESHOLDS } from '../model/thresholds.const';

describe('AI_ANALYTICS_THRESHOLDS', () => {
    it('пороги ровно по контракту 4.11', () => {
        expect(AI_ANALYTICS_THRESHOLDS).toEqual({
            scoreNone: 8,
            scoreLow: 20,
            rateOk: 30,
            ratingMin: 50,
            trendWindowCalls: 30,
            xmrSigma: 2.66,
            runLength: 7,
            z90: 1.645,
            shortCallSec: 300,
        });
    });
});

describe('confidenceFor', () => {
    it('n = 7 → none с причиной', () => {
        expect(confidenceFor(7, 'score')).toEqual({
            level: 'none',
            reason: METRIC_CONFIDENCE_REASONS.notEnoughData,
        });
        expect(confidenceFor(7, 'rate').level).toBe('none');
    });

    it('n = 12 → low для оценки и доли', () => {
        expect(confidenceFor(12, 'score')).toEqual({
            level: 'low',
            reason: METRIC_CONFIDENCE_REASONS.fewData,
        });
        expect(confidenceFor(12, 'rate').level).toBe('low');
    });

    it('n = 25: score → ok, rate → low', () => {
        expect(confidenceFor(25, 'score')).toEqual({ level: 'ok' });
        expect(confidenceFor(25, 'rate').level).toBe('low');
    });

    it('n = 30 → ok для доли', () => {
        expect(confidenceFor(30, 'rate')).toEqual({ level: 'ok' });
    });

    it('границы порогов: 8 → low, 19 → low, 20 → ok (score)', () => {
        expect(confidenceFor(8, 'score').level).toBe('low');
        expect(confidenceFor(19, 'score').level).toBe('low');
        expect(confidenceFor(20, 'score').level).toBe('ok');
    });

    it('NaN → none', () => {
        expect(confidenceFor(Number.NaN, 'score').level).toBe('none');
    });
});

describe('rateMetric', () => {
    it('4/35 → доля, интервал Уилсона 90 %, ok', () => {
        const metric = rateMetric(4, 35);
        expect(metric.n).toBe(35);
        expect(metric.value).toBeCloseTo(4 / 35, 6);
        expect(metric.confidence).toEqual({ level: 'ok' });
        expect(metric.ci90).toBeDefined();
        const [lower, upper] = metric.ci90 as [number, number];
        expect(lower).toBeCloseTo(0.052, 2);
        expect(upper).toBeCloseTo(0.232, 2);
    });

    it('0/18 → value 0, low, верхняя граница ≤ 0,17', () => {
        const metric = rateMetric(0, 18);
        expect(metric.value).toBe(0);
        expect(metric.confidence.level).toBe('low');
        expect((metric.ci90 as [number, number])[1]).toBeLessThanOrEqual(0.17);
    });

    it('при none value = null и без интервала', () => {
        const metric = rateMetric(2, 5);
        expect(metric).toEqual({
            value: null,
            n: 5,
            confidence: {
                level: 'none',
                reason: METRIC_CONFIDENCE_REASONS.notEnoughData,
            },
        });
        expect(rateMetric(0, 0).value).toBeNull();
    });

    it('successes обрезаются в [0, n]', () => {
        expect(rateMetric(40, 30).value).toBe(1);
        expect(rateMetric(-1, 30).value).toBe(0);
    });
});

describe('scoreMetric', () => {
    it('среднее по n = values.length', () => {
        const values = Array.from({ length: 20 }, (_, i) => (i % 10) + 1);
        const metric = scoreMetric(values);
        expect(metric.n).toBe(20);
        expect(metric.value).toBeCloseTo(5.5, 6);
        expect(metric.confidence).toEqual({ level: 'ok' });
        expect(metric.ci90).toBeUndefined();
    });

    it('12 оценок → low, значение есть', () => {
        const metric = scoreMetric(Array.from({ length: 12 }, () => 7));
        expect(metric.value).toBe(7);
        expect(metric.confidence.level).toBe('low');
    });

    it('7 оценок → none, value = null', () => {
        const metric = scoreMetric([1, 2, 3, 4, 5, 6, 7]);
        expect(metric.value).toBeNull();
        expect(metric.n).toBe(7);
        expect(metric.confidence.level).toBe('none');
    });

    it('пустой набор → none, n = 0', () => {
        expect(scoreMetric([])).toEqual({
            value: null,
            n: 0,
            confidence: {
                level: 'none',
                reason: METRIC_CONFIDENCE_REASONS.notEnoughData,
            },
        });
    });
});
