import { TREND_DEFAULTS, seedOf } from '@lib/sales-ai-analytics';
import { AI_TREND_METRICS } from '../constants/ai-trend.const';
import {
    buildTrendsPayload,
    trendParamsOf,
    type TrendsAssemblyInput,
} from '../domain/assembler/trends.assembler';
import { isoWeekKey } from '../domain/loaders/period.util';
import {
    TRENDS_MONTH_KEYS,
    TRENDS_WEEK_KEY,
    TRENDS_WEEK_KEYS,
    VERSIONS,
    WEEK_CALLS,
    monthRecords,
    weekRecords,
    weekScores,
} from './fixtures/trends.fixture';

/**
 * Сборка нагрузки трендов (план Фазы 3, П1): гейт `trend_window_calls`,
 * сдвиг уровня на фикстуре с внедрённым сдвигом, тишина на шумовом ряду,
 * разрыв по `comparableFrom`, месячные рёбра и воспроизводимость.
 */
const META = {
    calcVersion: 'sam-1.0.0',
    paramsVersion: 'pv-1',
    comparableFrom: null,
    generatedAt: '2026-09-21T00:15:00.000Z',
    modelSnapshotId: null,
};

/** Неделя сдвига (нулевой индекс окна) и его величина: +2 балла. */
const SHIFT_AT = 13;
const DELTA = 2;

function input(
    overrides: Partial<TrendsAssemblyInput> = {},
): TrendsAssemblyInput {
    return {
        weekKey: TRENDS_WEEK_KEY,
        weekKeys: TRENDS_WEEK_KEYS,
        monthKeys: TRENDS_MONTH_KEYS,
        managerIds: ['10', '20', '30'],
        weeks: [
            ...weekRecords('10', weekScores('m10', SHIFT_AT, DELTA)),
            ...weekRecords('20', weekScores('m20')),
            ...weekRecords('30', weekScores('m30').slice(0, 2)),
        ],
        months: [],
        comparableFrom: null,
        params: trendParamsOf({}),
        seed: seedOf('a.bitrix24.ru', TRENDS_WEEK_KEY, 'sam-1.0.0'),
        meta: META,
        ...overrides,
    };
}

const rowOf = (
    managerId: string,
    overrides: Partial<TrendsAssemblyInput> = {},
) =>
    buildTrendsPayload(input(overrides)).rows.find(
        row => row.managerId === managerId,
    );

describe('trendParamsOf — параметры трендов из реестра', () => {
    it('без слоёв — дефолты реестра, слой портала переопределяет', () => {
        expect(trendParamsOf({})).toEqual({
            alphaShort: TREND_DEFAULTS.alphaShort,
            alphaLong: TREND_DEFAULTS.alphaLong,
            sigmaK: TREND_DEFAULTS.sigmaK,
            fwer: TREND_DEFAULTS.fwer,
            windowCalls: TREND_DEFAULTS.windowCalls,
            xmrSigma: TREND_DEFAULTS.xmrSigma,
            comparableWeeks: TREND_DEFAULTS.comparableWeeks,
            minN: 8,
            goodhartWindowMonths: 3,
            goodhartDrop: 0.3,
        });
        expect(
            trendParamsOf({
                portal: { trend_window_calls: 20, trend_fwer: 0.2 },
            }),
        ).toMatchObject({ windowCalls: 20, fwer: 0.2 });
        // Значение вне диапазона реестра не применяется — дефолт.
        expect(trendParamsOf({ portal: { trend_fwer: 0.9 } }).fwer).toBe(
            TREND_DEFAULTS.fwer,
        );
    });
});

describe('buildTrendsPayload — гейт разборов и состав нагрузки', () => {
    it('менеджер с разборами меньше trend_window_calls записи не получает', () => {
        const assembly = buildTrendsPayload(input());
        expect(assembly.fewCalls).toEqual(['30']);
        expect(assembly.rows.map(row => row.managerId)).toEqual(['10', '20']);
        // Две недели по 12 разборов = 24 < 30; порог портала 20 пропускает.
        const relaxed = buildTrendsPayload(
            input({
                params: trendParamsOf({ portal: { trend_window_calls: 20 } }),
            }),
        );
        expect(relaxed.fewCalls).toEqual([]);
        expect(
            relaxed.rows.find(row => row.managerId === '30')?.payload.calls,
        ).toBe(2 * WEEK_CALLS);
    });

    it('нагрузка: неделя, окно, разборы, все метрики реестра и след калибровки', () => {
        const row = rowOf('20');
        expect(row?.payload.weekKey).toBe(TRENDS_WEEK_KEY);
        expect(row?.payload.window).toEqual({
            weeks: TRENDS_WEEK_KEYS,
            months: TRENDS_MONTH_KEYS,
        });
        expect(row?.payload.calls).toBe(26 * WEEK_CALLS);
        expect(row?.payload.metrics.map(metric => metric.metric)).toEqual([
            ...AI_TREND_METRICS,
        ]);
        expect(row?.payload.calibration).toMatchObject({
            iterations: TREND_DEFAULTS.iterations,
            fwer: TREND_DEFAULTS.fwer,
        });
        const week = row?.payload.calibration.families.find(
            family => family.grain === 'week',
        );
        // Семейство недели: качество и презентации у 10 и 20 — четыре ряда
        // (объём без разброса и пустые корзины в семейство не входят).
        expect(week?.series).toBe(4);
        expect(week?.cusumH).toBeGreaterThan(0);
        expect(row?.payload.meta).toEqual(META);
    });
});

describe('buildTrendsPayload — сигналы', () => {
    it('сдвиг +2 балла 13 недель назад: shift вверх по качеству с неделей начала', () => {
        const row = rowOf('10');
        expect(row?.payload.confidence).toBe('ok');
        const shift = row?.payload.signals.find(
            signal => signal.kind === 'shift' && signal.metric === 'quality',
        );
        expect(shift).toBeDefined();
        expect(shift?.direction).toBe('up');
        expect(shift?.grain).toBe('week');
        expect(shift?.confidence).toBe('ok');
        expect(TRENDS_WEEK_KEYS.slice(SHIFT_AT - 2, SHIFT_AT + 1)).toContain(
            shift?.sinceWeek,
        );
        expect(shift?.magnitude).toBeGreaterThan(DELTA - 0.75);
        expect(shift?.magnitude).toBeLessThan(DELTA + 0.75);
        // Сдвиги идут первыми, порог ряда не ниже нижней границы реестра.
        expect(row?.payload.signals[0].kind).toBe('shift');
        const quality = row?.payload.metrics.find(
            metric => metric.metric === 'quality',
        );
        expect(quality?.thresholds.cusumH).toBeGreaterThanOrEqual(
            TREND_DEFAULTS.cusumH,
        );
        expect(quality?.thresholds.driftK).toBeGreaterThanOrEqual(
            TREND_DEFAULTS.sigmaK,
        );
    });

    it('шумовой ряд: сигналов нет, доверие ok при 26 неделях', () => {
        const row = rowOf('20');
        expect(row?.payload.signals).toEqual([]);
        expect(row?.payload.confidence).toBe('ok');
        expect(row?.payload.reason).toBeNull();
        const quality = row?.payload.metrics.find(
            metric => metric.metric === 'quality',
        );
        expect(quality?.points).toBe(26);
        expect(quality?.n).toBe(26 * WEEK_CALLS);
    });

    it('объём без разброса и пустые корзины молчат с причиной, а не сигналят', () => {
        const row = rowOf('20');
        const volume = row?.payload.metrics.find(
            metric => metric.metric === 'volume',
        );
        expect(volume?.confidence).toBe('none');
        expect(volume?.reason).toBe('no-variance');
        const contact = row?.payload.metrics.find(
            metric => metric.metric === 'bucket_contact',
        );
        expect(contact?.points).toBe(0);
        expect(contact?.cut.noValue).toBe(26);
        expect(contact?.confidence).toBe('none');
        expect(contact?.reason).toBe('few-points');
    });

    it('разрыв comparableFrom: до границы не считаем, короткий хвост → none / series-break', () => {
        const row = rowOf('10', { comparableFrom: '2026-08-31' });
        const quality = row?.payload.metrics.find(
            metric => metric.metric === 'quality',
        );
        // Границе соответствует ISO-неделя 2026-W36: остаются W36–W38.
        expect(isoWeekKey('2026-08-31')).toBe('2026-W36');
        expect(quality?.points).toBe(3);
        expect(quality?.cut.beforeComparable).toBe(23);
        expect(quality?.confidence).toBe('none');
        expect(quality?.reason).toBe('series-break');
        expect(row?.payload.signals).toEqual([]);
        expect(row?.payload.confidence).toBe('none');
        expect(row?.payload.reason).toBe('series-break');
    });

    it('смена версий разбора рвёт ряд: считается только хвост текущей версии', () => {
        const scores = weekScores('m10', SHIFT_AT, DELTA);
        // Первые 20 недель — прежняя рубрика, последние 6 — текущая.
        const weeks = [
            ...weekRecords('10', scores.slice(0, 20), {
                versions: { ...VERSIONS, rubric: 'rubric-v2' },
            }).map((record, index) => ({
                ...record,
                periodKey: TRENDS_WEEK_KEYS[index],
            })),
            ...weekRecords('10', scores.slice(20)),
        ];
        const row = rowOf('10', { weeks, managerIds: ['10'] });
        const quality = row?.payload.metrics.find(
            metric => metric.metric === 'quality',
        );
        expect(quality?.cut.versionBreak).toBe(20);
        expect(quality?.points).toBe(6);
        expect(quality?.reason).toBe('series-break');
    });

    it('месячные рёбра: скачок доли ребра даёт shift по зерну month с неделей первого дня месяца', () => {
        const rates = [
            0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.6, 0.6, 0.6,
        ];
        const row = rowOf('20', { months: monthRecords('20', rates) });
        const edge = row?.payload.metrics.find(
            metric => metric.metric === 'edge_call_to_presentation',
        );
        expect(edge?.grain).toBe('month');
        expect(edge?.points).toBe(12);
        const shift = edge?.signals.find(signal => signal.kind === 'shift');
        expect(shift?.direction).toBe('up');
        expect(shift?.sinceWeek).toBe(isoWeekKey(`${shift?.sinceKey}-01`));
        expect(['2026-05', '2026-06'].includes(shift?.sinceKey ?? '')).toBe(
            true,
        );
        expect(shift?.magnitude).toBeCloseTo(0.4, 1);
        const month = row?.payload.calibration.families.find(
            family => family.grain === 'month',
        );
        // Фикстура двигает долю только первого ребра, у остальных трёх она
        // постоянна (0,3) — ряд без разброса в семейство не входит.
        expect(month?.series).toBe(1);
    });
});

describe('buildTrendsPayload — воспроизводимость (recompute)', () => {
    /** Все числовые листья значения с путями. */
    function numericLeaves(
        value: unknown,
        path = '$',
        out = new Map<string, number>(),
    ) {
        if (typeof value === 'number') out.set(path, value);
        else if (Array.isArray(value)) {
            value.forEach((item, index) =>
                numericLeaves(item, `${path}[${index}]`, out),
            );
        } else if (value !== null && typeof value === 'object') {
            for (const [key, item] of Object.entries(value)) {
                numericLeaves(item, `${path}.${key}`, out);
            }
        }
        return out;
    }

    it('тот же вход и seed → все числа совпадают с точностью 1e-9, форма та же', () => {
        const first = buildTrendsPayload(input());
        const second = buildTrendsPayload(input());
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
        const a = numericLeaves(first);
        const b = numericLeaves(second);
        expect(a.size).toBeGreaterThan(50);
        for (const [path, value] of a) {
            expect(
                Math.abs((b.get(path) ?? Number.NaN) - value),
            ).toBeLessThanOrEqual(1e-9);
        }
    });

    it('другой seed меняет калиброванные пороги, но не сам факт большого сдвига', () => {
        const other = buildTrendsPayload(input({ seed: 42 })).rows.find(
            row => row.managerId === '10',
        );
        const base = rowOf('10');
        expect(other?.payload.calibration.families).not.toEqual(
            base?.payload.calibration.families,
        );
        expect(
            other?.payload.signals.find(signal => signal.kind === 'shift')
                ?.direction,
        ).toBe('up');
    });
});
