import type { MatrixCallRow } from '../model/matrix.types';
import {
    buildQualityProgress,
    quadrantOf,
    qualityProgressPointsOf,
} from '../model/quality-progress';

/**
 * Матрица «качество × продвижение» (02.11.2026): клетка звонка по порогам
 * портала, точки только с менеджером, оценкой и продвижением, по менеджеру
 * — счётчики, средние с честным «мало данных» и положение по средним.
 */
const THRESHOLDS = { qualityScoreMin: 6, progressMovingMin: 4 };

const row = (
    transcriptionId: string,
    managerId: string | null,
    score: number | null,
    progress: number | null,
): MatrixCallRow => ({
    transcriptionId,
    managerId,
    callStartedAt: new Date('2026-11-01T10:00:00Z'),
    durationSec: 400,
    callType: 'presentation',
    analysisPresent: score !== null,
    score,
    nextStep: null,
    riskFlags: [],
    coachingPriority: null,
    sections: [],
    objections: [],
    versions: null,
    methodology: {
        code: 'polyansky',
        checkpointsDone: 1,
        checkpointsTotal: 2,
        spiralsFull: null,
        spiralsMinFull: null,
        dealProgress: progress,
        capsApplied: 0,
    },
});

const many = (
    prefix: string,
    managerId: string,
    count: number,
    score: number,
    progress: number,
): MatrixCallRow[] =>
    Array.from({ length: count }, (_, index) =>
        row(`${prefix}${index + 1}`, managerId, score, progress),
    );

describe('quadrantOf', () => {
    it('четыре клетки по порогам качества и движения', () => {
        expect(quadrantOf(7, 4, THRESHOLDS)).toBe('strong');
        expect(quadrantOf(7, 3, THRESHOLDS)).toBe('quality_no_progress');
        expect(quadrantOf(5.9, 5, THRESHOLDS)).toBe('progress_no_quality');
        expect(quadrantOf(4, 2, THRESHOLDS)).toBe('weak');
        expect(quadrantOf(6, 4, THRESHOLDS)).toBe('strong');
    });
});

describe('qualityProgressPointsOf', () => {
    it('берёт только звонки с менеджером, оценкой и продвижением; оценка — в шкале 1–10', () => {
        expect(
            qualityProgressPointsOf([
                row('a', '1', 70, 4),
                row('b', null, 70, 4),
                row('c', '1', null, 4),
                row('d', '1', 70, null),
                { ...row('e', '1', 70, 4), methodology: undefined },
            ]),
        ).toEqual([
            { managerId: '1', transcriptionId: 'a', score: 7, progress: 4 },
        ]);
    });
});

describe('buildQualityProgress', () => {
    it('счётчики клеток, средние, положение по средним, звонки «купил бы без менеджера» по id, итоги', () => {
        const matrix = buildQualityProgress(
            [
                ...many('s', '2', 5, 80, 5),
                ...many('b', '2', 3, 40, 4),
                ...many('w', '1', 2, 30, 1),
            ],
            THRESHOLDS,
        );
        expect(matrix).not.toBeNull();
        expect(matrix?.thresholds).toEqual(THRESHOLDS);
        expect(matrix?.managers.map(item => item.managerId)).toEqual([
            '1',
            '2',
        ]);

        const strong = matrix?.managers[1];
        expect(strong?.n).toBe(8);
        expect(strong?.counts).toEqual({
            strong: 5,
            quality_no_progress: 0,
            progress_no_quality: 3,
            weak: 0,
        });
        expect(strong?.score.value).toBeCloseTo(6.5, 5);
        expect(strong?.dealProgress.value).toBeCloseTo(4.625, 5);
        expect(strong?.position).toBe('strong');
        expect(strong?.progressNoQualityCallIds).toEqual(['b1', 'b2', 'b3']);

        const weak = matrix?.managers[0];
        expect(weak?.n).toBe(2);
        expect(weak?.counts.weak).toBe(2);
        expect(weak?.score.value).toBeNull();
        expect(weak?.position).toBeNull();

        expect(matrix?.totals.n).toBe(10);
        expect(matrix?.totals.counts).toEqual({
            strong: 5,
            quality_no_progress: 0,
            progress_no_quality: 3,
            weak: 2,
        });
        expect(matrix?.totals.position).toBe('weak');
    });

    it('без звонков с продвижением — null', () => {
        expect(
            buildQualityProgress([row('a', '1', 70, null)], THRESHOLDS),
        ).toBeNull();
        expect(buildQualityProgress([], THRESHOLDS)).toBeNull();
    });
});
