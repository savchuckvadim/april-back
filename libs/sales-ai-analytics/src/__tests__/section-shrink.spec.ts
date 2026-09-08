import { confidenceFor, scoreMetric } from '../model/metric';
import {
    QualityGroup,
    SECTION_SHRINK_DEFAULTS,
    estimateMS,
    shrinkSectionMetric,
    shrinkSectionScore,
} from '../model/section-shrink';

/**
 * Группа из size оценок с точным средним mean и внутригрупповым разбросом:
 * половина mean + spread, половина mean − spread (SS группы = size·spread²).
 */
const group = (
    key: string,
    mean: number,
    size = 20,
    spread = 1,
): QualityGroup => ({
    key,
    values: Array.from({ length: size }, (_, index) =>
        index % 2 === 0 ? mean + spread : mean - spread,
    ),
});

describe('estimateMS', () => {
    it('менее 5 менеджеров с n ≥ 20 → дефолт 10 (оценки не было)', () => {
        const result = estimateMS([
            group('m1', 6),
            group('m2', 7),
            group('m3', 8),
            group('m4', 5, 19),
            group('m5', 9, 10),
        ]);
        expect(result.mS).toBe(SECTION_SHRINK_DEFAULTS.mDefault);
        expect(result.source).toBe('default');
        expect(result.groups).toBe(3);
        expect(result.sigmaWithin).toBeNull();
        expect(result.tauBetween).toBeNull();
    });

    it('τ̂² ≤ 0 (менеджеры неразличимы) → m_S = m_max = 50 с пометкой', () => {
        const result = estimateMS([
            group('m1', 7),
            group('m2', 7),
            group('m3', 7),
            group('m4', 7),
            group('m5', 7),
            group('m6', 7),
        ]);
        expect(result.mS).toBe(SECTION_SHRINK_DEFAULTS.mMax);
        expect(result.mS).toBe(50);
        expect(result.source).toBe('managers-indistinguishable');
        expect(result.tauBetween).toBeNull();
        expect(result.sigmaWithin).toBeCloseTo(Math.sqrt(120 / 114), 6);
    });

    it('ANOVA по 5 менеджерам: m_S = σ²_внутри/τ̂²_между', () => {
        // MSW = 100/95 = 1,0526; средние ±0,6/±0,3/0 → MSB = 4,5, n₀ = 20,
        // τ̂² = (4,5 − 1,0526)/20 = 0,17237 → m_S = 6,107.
        const result = estimateMS([
            group('m1', 6.4),
            group('m2', 6.7),
            group('m3', 7.0),
            group('m4', 7.3),
            group('m5', 7.6),
        ]);
        expect(result.source).toBe('estimated');
        expect(result.groups).toBe(5);
        expect(result.sigmaWithin).toBeCloseTo(Math.sqrt(100 / 95), 6);
        expect(result.tauBetween).toBeCloseTo(Math.sqrt(0.1723684), 5);
        expect(result.mS).toBeCloseTo(6.107, 2);
    });

    it('разброс менеджеров велик → усадка слабее (m_S меньше)', () => {
        const wide = estimateMS([
            group('m1', 4),
            group('m2', 5.5),
            group('m3', 7),
            group('m4', 8.5),
            group('m5', 10),
        ]);
        const narrow = estimateMS([
            group('m1', 6.9),
            group('m2', 6.95),
            group('m3', 7),
            group('m4', 7.05),
            group('m5', 7.1),
        ]);
        expect(wide.mS).toBeLessThan(narrow.mS);
        expect(wide.mS).toBeGreaterThanOrEqual(SECTION_SHRINK_DEFAULTS.mMin);
        expect(narrow.mS).toBeLessThanOrEqual(SECTION_SHRINK_DEFAULTS.mMax);
    });

    it('NaN в значениях отбрасываются и не ломают ценз', () => {
        const dirty: QualityGroup = {
            key: 'm1',
            values: [...group('m1', 7).values, Number.NaN],
        };
        const result = estimateMS([
            dirty,
            group('m2', 7.5),
            group('m3', 6.5),
            group('m4', 7.2),
            group('m5', 6.8),
        ]);
        expect(result.groups).toBe(5);
        expect(Number.isFinite(result.mS)).toBe(true);
    });
});

describe('shrinkSectionScore', () => {
    it('Ŝ = (n·S̄ + m_S·μ)/(n + m_S), w = n/(n + m_S)', () => {
        const result = shrinkSectionScore({ n: 20, mean: 8, mu: 6, mS: 10 });
        expect(result.value).toBeCloseTo((20 * 8 + 10 * 6) / 30, 6);
        expect(result.w).toBeCloseTo(2 / 3, 6);
        expect(result.mS).toBe(10);
        expect(result.mu).toBe(6);
    });

    it('n = 0 → норма полосы, w = 0', () => {
        const result = shrinkSectionScore({ n: 0, mean: 9.5, mu: 6.4 });
        expect(result.value).toBe(6.4);
        expect(result.w).toBe(0);
        expect(result.mS).toBe(SECTION_SHRINK_DEFAULTS.mDefault);
    });

    it('m_S = 50 при неразличимых менеджерах усаживает сильнее дефолта', () => {
        const strong = shrinkSectionScore({ n: 20, mean: 9, mu: 6, mS: 50 });
        const light = shrinkSectionScore({ n: 20, mean: 9, mu: 6, mS: 10 });
        expect(strong.value).toBeLessThan(light.value);
        expect(strong.w).toBeCloseTo(20 / 70, 6);
    });

    it('m_S = 0 → собственное среднее без усадки, w = 1', () => {
        const result = shrinkSectionScore({ n: 12, mean: 8.2, mu: 6, mS: 0 });
        expect(result.value).toBeCloseTo(8.2, 6);
        expect(result.w).toBe(1);
    });
});

describe('shrinkSectionMetric', () => {
    it('усаживает значение и проставляет w, сохраняя n и доверие', () => {
        const metric = scoreMetric(Array.from({ length: 20 }, () => 8));
        const shrunk = shrinkSectionMetric(metric, 6, 10);
        expect(shrunk.value).toBeCloseTo((20 * 8 + 10 * 6) / 30, 6);
        expect(shrunk.w).toBeCloseTo(2 / 3, 6);
        expect(shrunk.n).toBe(20);
        expect(shrunk.confidence).toEqual(confidenceFor(20, 'score'));
    });

    it('confidence none — значение остаётся null (норма не выдаётся за оценку)', () => {
        const metric = scoreMetric([7, 7, 7]);
        const shrunk = shrinkSectionMetric(metric, 6, 10);
        expect(metric.confidence.level).toBe('none');
        expect(shrunk.value).toBeNull();
        expect(shrunk.w).toBeCloseTo(3 / 13, 6);
    });
});

describe('границы усадки оценки (§4.3)', () => {
    it('при n = 0 усаженная оценка равна норме слоя', () => {
        const result = shrinkSectionScore({ n: 0, mean: 9, mu: 6.4, mS: 10 });

        expect(result.value).toBeCloseTo(6.4, 9);
        expect(result.w).toBe(0);
    });

    it('при большом n усаженная оценка стремится к собственному среднему', () => {
        const small = shrinkSectionScore({ n: 20, mean: 8, mu: 6, mS: 10 });
        const large = shrinkSectionScore({ n: 10000, mean: 8, mu: 6, mS: 10 });

        expect(small.value).toBeCloseTo(6 + (2 * 20) / 30, 9);
        expect(large.value).toBeCloseTo(8, 2);
        expect(large.w).toBeGreaterThan(0.999);
        expect(large.value).toBeGreaterThan(small.value);
    });

    it('сильная усадка при неразличимых менеджерах тянет к норме', () => {
        const weak = shrinkSectionScore({ n: 20, mean: 8, mu: 6, mS: 10 });
        const strong = shrinkSectionScore({
            n: 20,
            mean: 8,
            mu: 6,
            mS: SECTION_SHRINK_DEFAULTS.mMax,
        });

        expect(strong.value).toBeLessThan(weak.value);
        expect(strong.w).toBeCloseTo(20 / 70, 9);
    });
});
