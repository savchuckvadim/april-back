import {
    MOVING_RANGE_D2,
    normalizeTrendSeries,
    personalSigma,
    versionBreakIndex,
} from '../trend-series';
import {
    versionsSeriesKey,
    type AnalysisVersions,
} from '../../../contracts/versions.types';
import type { TrendPoint } from '../trend.types';
import { toPoints, weekKeys } from './trend.fixture';

const point = (
    key: string,
    value: number | null,
    signature: string | null = null,
): TrendPoint => ({ key, value, n: 10, signature });

describe('normalizeTrendSeries — ряд после разрывов', () => {
    it('сортирует по ключу, повтор ключа берёт последнюю точку', () => {
        const series = normalizeTrendSeries([
            point('2026-W03', 3),
            point('2026-W01', 1),
            point('2026-W02', 2),
            point('2026-W01', 1.5),
        ]);
        expect(series.points.map(item => item.key)).toEqual([
            '2026-W01',
            '2026-W02',
            '2026-W03',
        ]);
        expect(series.points[0].value).toBe(1.5);
        expect(series.cut).toEqual({
            beforeComparable: 0,
            versionBreak: 0,
            noValue: 0,
        });
    });

    it('точки раньше comparableFrom отбрасываются и считаются', () => {
        const series = normalizeTrendSeries(toPoints([1, 2, 3, 4]), {
            comparableFromKey: '2026-W03',
        });
        expect(series.points.map(item => item.key)).toEqual([
            '2026-W03',
            '2026-W04',
        ]);
        expect(series.cut.beforeComparable).toBe(2);
        expect(series.comparableFromKey).toBe('2026-W03');
        expect(
            normalizeTrendSeries(toPoints([1]), { comparableFromKey: '' })
                .comparableFromKey,
        ).toBeNull();
    });

    it('смена сигнатуры версий рвёт ряд: остаётся хвост текущей версии', () => {
        const keys = weekKeys(5);
        const series = normalizeTrendSeries([
            point(keys[0], 1, 'v1'),
            point(keys[1], 2, 'v1'),
            point(keys[2], 3, 'v2'),
            point(keys[3], 4, null),
            point(keys[4], 5, 'v2'),
        ]);
        expect(series.points.map(item => item.value)).toEqual([3, 4, 5]);
        expect(series.cut.versionBreak).toBe(2);
    });

    it('точки без значения («мало данных») выпадают, но не рвут ряд', () => {
        const keys = weekKeys(4);
        const series = normalizeTrendSeries([
            point(keys[0], 6),
            point(keys[1], null),
            point(keys[2], 6.5),
            point(keys[3], Number.NaN),
        ]);
        expect(series.points.map(item => item.value)).toEqual([6, 6.5]);
        expect(series.cut.noValue).toBe(2);
    });
});

describe('versionBreakIndex', () => {
    it('без сигнатур и при одной сигнатуре разрыва нет', () => {
        expect(versionBreakIndex(toPoints([1, 2, 3]))).toBe(0);
        expect(versionBreakIndex(toPoints([1, 2, 3], 10, 'v1'))).toBe(0);
    });

    it('индекс — последняя смена сигнатуры', () => {
        const keys = weekKeys(4);
        expect(
            versionBreakIndex([
                point(keys[0], 1, 'v1'),
                point(keys[1], 1, 'v2'),
                point(keys[2], 1, 'v2'),
                point(keys[3], 1, 'v3'),
            ]),
        ).toBe(3);
    });
});

/**
 * Сигнатура точки — серия версий (`versionsSeriesKey`): минорные правки
 * задания модели ряд не рвут, правка по существу — рвёт.
 */
describe('versionBreakIndex — серии версий разбора', () => {
    const V31: AnalysisVersions = {
        prompt: 'focus-v3.1-2026-11-06',
        rubric: 'sections-7-v2',
        registry: 'a1b2c3d4e5f6',
        attribution: '2026-08-24',
        classifier: '2026-10-21',
    };
    const keys = weekKeys(4);
    const seriesPoint = (key: string, versions: AnalysisVersions) =>
        point(key, 6, versionsSeriesKey(versions));

    it('недели на 3.1 → 3.2 → 3.3 подряд — ряд не рвётся', () => {
        expect(
            versionBreakIndex([
                seriesPoint(keys[0], V31),
                seriesPoint(keys[1], {
                    ...V31,
                    prompt: 'focus-v3.2-2026-11-16',
                }),
                seriesPoint(keys[2], {
                    ...V31,
                    prompt: 'focus-v3.3-2026-11-17',
                }),
            ]),
        ).toBe(0);
    });

    it('версия промпта без записи в таблице серий — ряд рвётся на ней', () => {
        expect(
            versionBreakIndex([
                seriesPoint(keys[0], V31),
                seriesPoint(keys[1], V31),
                seriesPoint(keys[2], {
                    ...V31,
                    prompt: 'focus-v4.0-2026-11-24',
                }),
            ]),
        ).toBe(2);
    });
});

describe('personalSigma — MR̄ / d₂', () => {
    it('равна среднему скользящему размаху, делённому на 1,128', () => {
        expect(personalSigma([1, 2, 3])).toBeCloseTo(1 / MOVING_RANGE_D2, 12);
        expect(personalSigma([1, 3, 2, 6])).toBeCloseTo(
            (2 + 1 + 4) / 3 / MOVING_RANGE_D2,
            12,
        );
    });

    it('одна точка или ряд без разброса → null', () => {
        expect(personalSigma([5])).toBeNull();
        expect(personalSigma([])).toBeNull();
        expect(personalSigma([2, 2, 2])).toBeNull();
    });
});
