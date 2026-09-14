import {
    BucketScoreInput,
    aggregateBucketScores,
    bucketOfCallType,
    compareCallTypes,
} from './buckets';
import { buildCellCore, callScore10, hasScore } from './matrix-cell';
import {
    ManagerMatrixRow,
    ManagerTypeCell,
    ManagerTypeMatrix,
    MatrixCallRow,
    MatrixExcluded,
    MatrixOptions,
    MatrixThresholds,
    TypeTotalsCell,
} from './matrix.types';
import { MetricValue, scoreMetric } from './metric';
import {
    MIN_DURATION_DEFAULT_TYPE,
    minDurationSecOf,
    type MinDurationSecByType,
} from './pulse';
import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';
import { DEFAULT_WORK_CALENDAR, toPortalDate } from './workdays.util';

export const MATRIX_DEFAULT_THRESHOLDS: MatrixThresholds = {
    shortCallSec: AI_ANALYTICS_THRESHOLDS.shortCallSec,
};

/**
 * Опции матрицы с порогом длительности ПО ТИПАМ (реестр
 * `min_duration_sec_by_type`, решение владельца А.1): карта побеждает
 * скаляр `thresholds.shortCallSec`, скаляр остаётся запасным порогом для
 * типов вне карты. Без карты и скаляра — константа Фазы 1a (300 с).
 */
export interface ManagerTypeMatrixOptions extends MatrixOptions {
    minDurationSecByType?: MinDurationSecByType;
}

/**
 * Эффективная карта порогов из опций: ключ «все прочие типы» — скаляр
 * (или 300 с), поверх — карта по типам. Одна функция для матрицы и среза
 * возражений: оба обязаны считать «короткий» одинаково.
 */
export function minDurationMapOf(
    shortCallSec?: number,
    byType?: MinDurationSecByType,
): MinDurationSecByType {
    return {
        [MIN_DURATION_DEFAULT_TYPE]:
            shortCallSec ?? MATRIX_DEFAULT_THRESHOLDS.shortCallSec,
        ...(byType ?? {}),
    };
}

/**
 * Звонок короче порога своего типа (тип неизвестен — ключ «все прочие
 * типы»); длительность null — не короткий. Тот же предикат, что внутри
 * `isAnalyzedCall` пульса: знаменатель пульса и слой качества матрицы
 * режут одни и те же звонки.
 */
export const isBelowMinDuration = (
    row: Pick<MatrixCallRow, 'durationSec' | 'callType'>,
    byType: MinDurationSecByType,
): boolean =>
    row.durationSec !== null &&
    row.durationSec < minDurationSecOf(row.callType, byType);

/** Строка, прошедшая фильтры слоя качества: менеджер и тип известны. */
type QualityRow = MatrixCallRow & { managerId: string; callType: string };

type Verdict =
    | { kind: 'ok'; row: QualityRow }
    | { kind: 'before'; row: QualityRow }
    | { kind: keyof Omit<MatrixExcluded, 'beforeComparable'> };

interface Classified {
    ok: QualityRow[];
    before: QualityRow[];
    excluded: MatrixExcluded;
}

const emptyExcluded = (): MatrixExcluded => ({
    noAnalysis: 0,
    noManager: 0,
    noType: 0,
    short: 0,
    beforeComparable: 0,
});

function judge(
    row: MatrixCallRow,
    byType: MinDurationSecByType,
    comparableFrom: string | null,
    timeZone: string,
): Verdict {
    if (!row.analysisPresent) {
        return { kind: 'noAnalysis' };
    }
    if (row.managerId === null || row.managerId === '') {
        return { kind: 'noManager' };
    }
    if (row.callType === null || row.callType === '') {
        return { kind: 'noType' };
    }
    if (isBelowMinDuration(row, byType)) {
        return { kind: 'short' };
    }
    const quality: QualityRow = {
        ...row,
        managerId: row.managerId,
        callType: row.callType,
    };
    if (comparableFrom === null) {
        return { kind: 'ok', row: quality };
    }
    const day =
        row.callStartedAt === null
            ? null
            : toPortalDate(row.callStartedAt, timeZone);
    return day !== null && day >= comparableFrom
        ? { kind: 'ok', row: quality }
        : { kind: 'before', row: quality };
}

function classify(
    rows: readonly MatrixCallRow[],
    options: ManagerTypeMatrixOptions,
): Classified {
    const byType = minDurationMapOf(
        options.thresholds?.shortCallSec,
        options.minDurationSecByType,
    );
    const comparableFrom = options.comparableFrom ?? null;
    const timeZone = options.timeZone ?? DEFAULT_WORK_CALENDAR.timeZone;
    const result: Classified = {
        ok: [],
        before: [],
        excluded: emptyExcluded(),
    };
    for (const row of rows) {
        const verdict = judge(row, byType, comparableFrom, timeZone);
        if (verdict.kind === 'ok') {
            result.ok.push(verdict.row);
        } else if (verdict.kind === 'before') {
            result.before.push(verdict.row);
            result.excluded.beforeComparable += 1;
        } else {
            result.excluded[verdict.kind] += 1;
        }
    }
    return result;
}

function groupBy<T>(
    items: readonly T[],
    keyOf: (item: T) => string,
): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const item of items) {
        const key = keyOf(item);
        const bucket = groups.get(key) ?? [];
        bucket.push(item);
        groups.set(key, bucket);
    }
    return groups;
}

/** Ключи двух групп вместе, отсортированные компаратором. */
function unionKeys(
    a: ReadonlyMap<string, unknown>,
    b: ReadonlyMap<string, unknown>,
    compare: (x: string, y: string) => number,
): string[] {
    return [...new Set([...a.keys(), ...b.keys()])].sort(compare);
}

const toBucketInputs = (rows: readonly QualityRow[]): BucketScoreInput[] =>
    rows
        .filter(hasScore)
        .map(row => ({ callType: row.callType, score: callScore10(row) }));

/** Среднее по звонкам с корзиной (other / irrelevant не участвуют). */
const bucketedScore = (rows: readonly QualityRow[]): MetricValue =>
    scoreMetric(
        rows
            .filter(hasScore)
            .filter(row => bucketOfCallType(row.callType) !== null)
            .map(callScore10),
    );

function buildManagerRow(
    managerId: string,
    ok: readonly QualityRow[],
    before: readonly QualityRow[],
): ManagerMatrixRow {
    const okByType = groupBy(ok, row => row.callType);
    const beforeByType = groupBy(before, row => row.callType);
    const byType: ManagerTypeCell[] = unionKeys(
        okByType,
        beforeByType,
        compareCallTypes,
    ).map(callType => ({
        managerId,
        callType,
        bucket: bucketOfCallType(callType),
        ...buildCellCore(
            okByType.get(callType) ?? [],
            beforeByType.get(callType)?.length ?? 0,
        ),
    }));
    return {
        managerId,
        n: ok.length,
        nBeforeComparable: before.length,
        score: bucketedScore(ok),
        buckets: aggregateBucketScores(toBucketInputs(ok)),
        byType,
    };
}

function buildTotals(
    ok: readonly QualityRow[],
    before: readonly QualityRow[],
): TypeTotalsCell[] {
    const okByType = groupBy(ok, row => row.callType);
    const beforeByType = groupBy(before, row => row.callType);
    return unionKeys(okByType, beforeByType, compareCallTypes).map(callType => {
        const rows = okByType.get(callType) ?? [];
        return {
            callType,
            bucket: bucketOfCallType(callType),
            managers: new Set(rows.map(row => row.managerId)).size,
            ...buildCellCore(rows, beforeByType.get(callType)?.length ?? 0),
        };
    });
}

/**
 * Матрица менеджер × тип звонка за период (план §4.3, §6.3, ТЗ FR-22).
 * В слой качества попадают строки с разбором, менеджером и типом,
 * не короче порога своего типа (карта `minDurationSecByType`, иначе
 * скаляр shortCallSec, иначе 300 с); при заданном comparableFrom строки до этой даты
 * (в TZ портала) и строки без даты считаются отдельно (nBeforeComparable)
 * и в оценки не смешиваются (§5.4). Ячейка: n, score (среднее S/10 при
 * n ≥ 8), разделы с relevance > 0, чек-листы, три опорных звонка,
 * versionsMixed. Итоги по типам, корзины менеджера и отдела — той же
 * функцией ядра. Чистая детерминированная функция: порядок входа не влияет.
 */
export function buildManagerTypeMatrix(
    rows: readonly MatrixCallRow[],
    options: ManagerTypeMatrixOptions = {},
): ManagerTypeMatrix {
    const { ok, before, excluded } = classify(rows, options);
    const okByManager = groupBy(ok, row => row.managerId);
    const beforeByManager = groupBy(before, row => row.managerId);
    const managers = unionKeys(okByManager, beforeByManager, (a, b) =>
        a.localeCompare(b),
    ).map(managerId =>
        buildManagerRow(
            managerId,
            okByManager.get(managerId) ?? [],
            beforeByManager.get(managerId) ?? [],
        ),
    );
    return {
        managers,
        totals: buildTotals(ok, before),
        buckets: aggregateBucketScores(toBucketInputs(ok)),
        analyzed: ok.length,
        noBucket: ok.filter(row => bucketOfCallType(row.callType) === null)
            .length,
        comparableFrom: options.comparableFrom ?? null,
        excluded,
    };
}
