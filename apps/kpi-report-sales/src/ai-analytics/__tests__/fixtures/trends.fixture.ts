import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    mulberry32,
    sampleNormal,
    seedOf,
    type AiAnalyticsSnapshotType,
} from '@lib/sales-ai-analytics';
import {
    AI_TREND_WEEKS_WINDOW,
    trendWeekKeys,
} from '../../constants/ai-trend.const';
import { AI_ANALYTICS_FUNNEL_EDGE_CODES } from '../../constants/ai-overview.const';
import type { TrendSnapshotRecord } from '../../domain/assembler/trends.series';
import type { AiAnalyticsSnapshotRecord } from '../../store/ai-analytics-snapshot.store';

/**
 * Фикстуры трендов: недельные и месячные записи менеджеров в форме
 * нагрузок `manager-week` / `manager-month` (только поля, которые читают
 * ряды) с детерминированным шумом библиотечного ГПСЧ.
 */

/** Неделя расчёта — закончившаяся ISO-неделя прогона 21.09.2026. */
export const TRENDS_WEEK_KEY = '2026-W38';
export const TRENDS_WEEK_KEYS = trendWeekKeys(
    TRENDS_WEEK_KEY,
    AI_TREND_WEEKS_WINDOW,
);
export const TRENDS_MONTH_KEYS = [
    '2025-09',
    '2025-10',
    '2025-11',
    '2025-12',
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
];

/** Разборов в неделе по умолчанию (≥ n_min_none, чтобы оценка была видна). */
export const WEEK_CALLS = 12;

/** Порог «мало данных» оценки недели (n_min_none). */
const SCORE_MIN_N = 8;

export const VERSIONS = {
    prompt: 'focus-v2.1-2026-05-01',
    rubric: 'rubric-v3',
    registry: 'reg-1',
    attribution: '2026-01-01',
    classifier: 'cls-1',
};

/** Оценки недель: шум N(6, 0,5²) по seed, с недели shiftAt уровень + delta. */
export function weekScores(
    seed: string,
    shiftAt: number | null = null,
    delta = 0,
    count = AI_TREND_WEEKS_WINDOW,
): number[] {
    const random = mulberry32(seedOf('trends-fixture', seed));

    return Array.from({ length: count }, (_, index) => {
        const value = 6 + 0.5 * sampleNormal(random);

        return shiftAt !== null && index >= shiftAt ? value + delta : value;
    });
}

/** Метрика оценки: значение видно только при n ≥ n_min_none. */
const scoreMetric = (score: number, n: number) => ({
    value: n >= SCORE_MIN_N ? score : null,
    n,
    confidence: { level: n >= SCORE_MIN_N ? 'low' : 'none' },
});

/** Нагрузка недели менеджера в объёме, который читают ряды. */
export function weekPayload(
    score: number,
    n = WEEK_CALLS,
    versions: Record<string, string> | null = VERSIONS,
): Record<string, unknown> {
    return {
        n,
        score: scoreMetric(score, n),
        buckets: [
            { bucket: 'contact', n: 0, score: scoreMetric(score, 0) },
            { bucket: 'presentation', n, score: scoreMetric(score, n) },
            { bucket: 'closing', n: 0, score: scoreMetric(score, 0) },
        ],
        versions,
        versionsMixed: false,
        comparableFrom: null,
    };
}

/** Недельные записи менеджера по ключам окна (первые `scores.length`). */
export function weekRecords(
    managerId: string,
    scores: readonly number[],
    options: { n?: number; versions?: Record<string, string> | null } = {},
): TrendSnapshotRecord[] {
    const offset = TRENDS_WEEK_KEYS.length - scores.length;

    return scores.map((score, index) => ({
        periodKey: TRENDS_WEEK_KEYS[offset + index],
        managerId,
        payload: weekPayload(score, options.n, options.versions),
    }));
}

/** Нагрузка месяца: рёбра воронки с n событий и долей rate у первого ребра. */
export function monthPayload(rate: number, n = 50): Record<string, unknown> {
    return {
        edges: AI_ANALYTICS_FUNNEL_EDGE_CODES.map((edge, index) => ({
            edge,
            n,
            s: Math.round(n * (index === 0 ? rate : 0.3)),
            estimand: 'rate',
            mixedSources: false,
        })),
    };
}

/** Месячные записи менеджера по ключам окна. */
export function monthRecords(
    managerId: string,
    rates: readonly number[],
): TrendSnapshotRecord[] {
    return rates.map((rate, index) => ({
        periodKey: TRENDS_MONTH_KEYS[index],
        managerId,
        payload: monthPayload(rate),
    }));
}

/** Запись стора снапшотов из записи ряда (для мока стора шага). */
export function storeRecord(
    type: AiAnalyticsSnapshotType,
    record: TrendSnapshotRecord,
    id = `ais-${type}-${record.periodKey}-${record.managerId}`,
): AiAnalyticsSnapshotRecord {
    return {
        id,
        createdAt: new Date('2026-09-21T00:15:00Z'),
        status: 'done',
        domain: 'a.bitrix24.ru',
        type,
        periodKey: record.periodKey,
        managerId: record.managerId,
        calcVersion: 'sam-1.0.0',
        paramsVersion: 'pv-1',
        inputsHash: 'hash-1',
        generatedAt: '2026-09-21T00:15:00.000Z',
        payload: record.payload,
    };
}

/** Маркер недели без разборов — портальная запись (managerId null). */
export function emptyWeekStoreRecord(
    periodKey: string,
): AiAnalyticsSnapshotRecord {
    return {
        ...storeRecord(AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek, {
            periodKey,
            managerId: 'portal',
            payload: { empty: true, n: 0 },
        }),
        managerId: null,
    };
}
