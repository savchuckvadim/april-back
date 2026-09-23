import { TREND_DEFAULTS } from '../trend-defaults';
import { normalizeTrendSeries } from '../trend-series';
import { detectOutlier, detectTrendSignals } from '../trend-signals';
import type { TrendDetectOptions, TrendSeries } from '../trend.types';
import {
    nullSeries,
    shiftedSeries,
    specSeed,
    toPoints,
    weekKeys,
} from './trend.fixture';

const OPTIONS: TrendDetectOptions = {
    alphaShort: TREND_DEFAULTS.alphaShort,
    alphaLong: TREND_DEFAULTS.alphaLong,
    cusumK: TREND_DEFAULTS.cusumK,
    baselinePoints: TREND_DEFAULTS.baselinePoints,
    consecutive: TREND_DEFAULTS.consecutive,
    minPoints: TREND_DEFAULTS.minPoints,
    okPoints: TREND_DEFAULTS.okPoints,
    thresholds: {
        cusumH: TREND_DEFAULTS.cusumH,
        driftK: TREND_DEFAULTS.sigmaK,
        xmrSigma: TREND_DEFAULTS.xmrSigma,
    },
};

const seriesOf = (values: readonly number[]): TrendSeries =>
    normalizeTrendSeries(toPoints(values));

describe('detectTrendSignals — доверие и молчание', () => {
    it('меньше minPoints точек → none, few-points, сигналов нет', () => {
        const result = detectTrendSignals(seriesOf([6, 7, 6, 7]), OPTIONS);
        expect(result).toEqual({
            confidence: 'none',
            reason: 'few-points',
            points: 4,
            sigma: null,
            signals: [],
        });
    });

    it('ряд короток из-за разрыва comparableFrom → причина series-break', () => {
        const series = normalizeTrendSeries(
            toPoints(nullSeries(specSeed('signals', 1), 12)),
            { comparableFromKey: weekKeys(12)[8] },
        );
        const result = detectTrendSignals(series, OPTIONS);
        expect(result.confidence).toBe('none');
        expect(result.reason).toBe('series-break');
        expect(result.points).toBe(4);
    });

    it('ряд без разброса → none, no-variance', () => {
        const result = detectTrendSignals(
            seriesOf(Array.from({ length: 10 }, () => 6)),
            OPTIONS,
        );
        expect(result.confidence).toBe('none');
        expect(result.reason).toBe('no-variance');
    });

    it('шум без сдвига: сигналов нет, доверие low до okPoints и ok после', () => {
        const values = nullSeries(specSeed('signals', 2), 26);
        const short = detectTrendSignals(seriesOf(values.slice(0, 10)), {
            ...OPTIONS,
            thresholds: { cusumH: 8, driftK: 4, xmrSigma: 4 },
        });
        expect(short.confidence).toBe('low');
        expect(short.reason).toBe('few-points');
        const long = detectTrendSignals(seriesOf(values), {
            ...OPTIONS,
            thresholds: { cusumH: 8, driftK: 4, xmrSigma: 4 },
        });
        expect(long.confidence).toBe('ok');
        expect(long.reason).toBeNull();
        expect(long.signals).toEqual([]);
        expect(long.sigma).toBeGreaterThan(0);
    });
});

describe('detectTrendSignals — сигналы', () => {
    const shifted = shiftedSeries(specSeed('signals', 3), 26, 13, 2);

    it('сдвиг уровня: shift вверх с ключом недели начала, выброс той же стороны не дублируется', () => {
        const result = detectTrendSignals(seriesOf(shifted), OPTIONS);
        const shift = result.signals.find(signal => signal.kind === 'shift');
        expect(shift).toBeDefined();
        expect(shift?.direction).toBe('up');
        expect(shift?.sinceKey).toBe(weekKeys(26)[shift?.sinceIndex ?? 0]);
        expect(shift?.sinceIndex).toBeGreaterThanOrEqual(11);
        expect(shift?.sinceIndex).toBeLessThanOrEqual(13);
        expect(
            result.signals.some(
                signal =>
                    signal.kind === 'outlier' && signal.direction === 'up',
            ),
        ).toBe(false);
        expect(result.signals[0].kind).toBe('shift');
    });

    it('одиночный выброс последней точки: outlier с величиной от центра', () => {
        const values = [...nullSeries(specSeed('signals', 4), 20), 12];
        const result = detectTrendSignals(seriesOf(values), {
            ...OPTIONS,
            thresholds: { ...OPTIONS.thresholds, cusumH: 100, driftK: 100 },
        });
        expect(result.signals.map(signal => signal.kind)).toEqual(['outlier']);
        const outlier = result.signals[0];
        expect(outlier.direction).toBe('up');
        expect(outlier.sinceKey).toBe(weekKeys(21)[20]);
        expect(outlier.magnitude).toBeGreaterThan(4);
        expect(outlier.statistic).toBeGreaterThan(outlier.threshold);
    });

    it('detectOutlier молчит при состоянии in и run', () => {
        const flat = toPoints(nullSeries(specSeed('signals', 5), 12)).map(
            point => ({
                key: point.key,
                value: point.value as number,
                n: point.n,
            }),
        );
        expect(detectOutlier(flat, 0.5, 2.66)).toBeNull();
        const run = Array.from({ length: 12 }, (_, index) => ({
            key: weekKeys(12)[index],
            value: index < 5 ? 6 - (index % 2) * 0.2 : 6.5 + (index % 2) * 0.1,
            n: 10,
        }));
        expect(detectOutlier(run, 0.2, 2.66)).toBeNull();
    });

    it('один вход — один результат: повторный расчёт совпадает целиком', () => {
        const first = detectTrendSignals(seriesOf(shifted), OPTIONS);
        const second = detectTrendSignals(seriesOf(shifted), OPTIONS);
        expect(second).toEqual(first);
    });
});
