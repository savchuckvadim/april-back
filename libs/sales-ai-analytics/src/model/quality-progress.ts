/**
 * Матрица «качество × продвижение» (план методики Полянского, этап 2,
 * materials §dealProgress): каждый звонок с оценкой и продвижением сделки
 * (ядро focus-v3.0, типы с продвижением) попадает в одну из четырёх клеток
 * по порогам портала — качество от `quality_progress_score_min` (1–10),
 * движение сделки от `deal_progress_moving_min` (1–5). Клетка «низкое
 * качество + высокое продвижение» — «клиент купил бы и без менеджера».
 *
 * По менеджеру — счётчики клеток, средние обеих осей (честное «мало
 * данных» при n < 8) и положение по средним. Чистые функции.
 */
import { callScore10, hasScore } from './matrix-cell';
import type { MatrixCallRow } from './matrix.types';
import { MetricValue, scoreMetric } from './metric';

export const QUALITY_PROGRESS_QUADRANTS = [
    'strong',
    'quality_no_progress',
    'progress_no_quality',
    'weak',
] as const;
export type QualityProgressQuadrant =
    (typeof QUALITY_PROGRESS_QUADRANTS)[number];

export interface QualityProgressThresholds {
    /** Оценка звонка 1–10, с которой качество достаточно. */
    qualityScoreMin: number;
    /** Продвижение сделки 1–5, с которого сделка движется. */
    progressMovingMin: number;
}

export type QualityProgressCounts = Record<QualityProgressQuadrant, number>;

/** Клетки и средние по набору звонков (менеджер или отдел). */
export interface QualityProgressCell {
    /** Звонков с оценкой и продвижением. */
    n: number;
    /** Средняя оценка 1–10 по этим звонкам; none при n < 8. */
    score: MetricValue;
    /** Среднее продвижение 1–5; none при n < 8. */
    dealProgress: MetricValue;
    counts: QualityProgressCounts;
    /** Клетка по средним; null — мало данных. */
    position: QualityProgressQuadrant | null;
}

export interface ManagerQualityProgress extends QualityProgressCell {
    managerId: string;
    /** Звонки «купил бы и без менеджера», id по возрастанию. */
    progressNoQualityCallIds: string[];
}

export interface QualityProgressMatrix {
    thresholds: QualityProgressThresholds;
    /** По managerId по возрастанию. */
    managers: ManagerQualityProgress[];
    /** Все звонки менеджеров вместе. */
    totals: QualityProgressCell;
}

/** Точка матрицы: один звонок с оценкой 1–10 и продвижением 1–5. */
export interface QualityProgressPoint {
    managerId: string;
    transcriptionId: string;
    score: number;
    progress: number;
}

/** Клетка звонка по порогам. */
export function quadrantOf(
    score10: number,
    progress: number,
    thresholds: QualityProgressThresholds,
): QualityProgressQuadrant {
    const quality = score10 >= thresholds.qualityScoreMin;
    const moving = progress >= thresholds.progressMovingMin;
    if (quality && moving) return 'strong';
    if (quality) return 'quality_no_progress';
    if (moving) return 'progress_no_quality';
    return 'weak';
}

export const emptyQualityProgressCounts = (): QualityProgressCounts => ({
    strong: 0,
    quality_no_progress: 0,
    progress_no_quality: 0,
    weak: 0,
});

/** Строки с менеджером, оценкой и продвижением → точки матрицы. */
export function qualityProgressPointsOf(
    rows: readonly MatrixCallRow[],
): QualityProgressPoint[] {
    return rows.flatMap(row => {
        const progress = row.methodology?.dealProgress;
        if (!hasScore(row) || row.managerId === null || row.managerId === '') {
            return [];
        }
        if (typeof progress !== 'number' || !Number.isFinite(progress)) {
            return [];
        }
        return [
            {
                managerId: row.managerId,
                transcriptionId: row.transcriptionId,
                score: callScore10(row),
                progress,
            },
        ];
    });
}

function cellOf(
    points: readonly QualityProgressPoint[],
    thresholds: QualityProgressThresholds,
): QualityProgressCell {
    const counts = emptyQualityProgressCounts();
    for (const point of points) {
        counts[quadrantOf(point.score, point.progress, thresholds)] += 1;
    }
    const score = scoreMetric(points.map(point => point.score));
    const dealProgress = scoreMetric(points.map(point => point.progress));
    return {
        n: points.length,
        score,
        dealProgress,
        counts,
        position:
            score.value !== null && dealProgress.value !== null
                ? quadrantOf(score.value, dealProgress.value, thresholds)
                : null,
    };
}

/**
 * Матрица по строкам периода: null — ни одного звонка с оценкой и
 * продвижением (разборов focus-v3.0 ещё нет).
 */
export function buildQualityProgress(
    rows: readonly MatrixCallRow[],
    thresholds: QualityProgressThresholds,
): QualityProgressMatrix | null {
    const points = qualityProgressPointsOf(rows);
    if (points.length === 0) return null;
    const byManager = new Map<string, QualityProgressPoint[]>();
    for (const point of points) {
        const list = byManager.get(point.managerId) ?? [];
        list.push(point);
        byManager.set(point.managerId, list);
    }
    const managers = [...byManager.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([managerId, managerPoints]) => ({
            managerId,
            ...cellOf(managerPoints, thresholds),
            progressNoQualityCallIds: managerPoints
                .filter(
                    point =>
                        quadrantOf(point.score, point.progress, thresholds) ===
                        'progress_no_quality',
                )
                .map(point => point.transcriptionId)
                .sort((a, b) => a.localeCompare(b)),
        }));
    return { thresholds, managers, totals: cellOf(points, thresholds) };
}
