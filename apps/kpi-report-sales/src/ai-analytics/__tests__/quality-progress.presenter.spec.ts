import type { AnalyticsCallLiteRow } from '@lib/call-lib';
import {
    buildQualityProgressDto,
    qualityProgressExplanation,
    QUALITY_PROGRESS_QUADRANT_TEXTS,
} from '../domain/presenter/quality-progress.presenter';
import { liteRow } from './fixtures/lite-row.fixture';

/**
 * Блок «качество × продвижение» обзора (02.11.2026): клетки с русскими
 * названиями, строки менеджеров с объяснением словами, честное «мало
 * данных», null без разборов с продвижением.
 */
const THRESHOLDS = { qualityScoreMin: 6, progressMovingMin: 4 };

const withProgress = (
    transcriptionId: string,
    managerId: string,
    score: number,
    dealProgress: number | null,
): AnalyticsCallLiteRow =>
    liteRow({
        transcriptionId,
        managerId,
        score,
        methodology: {
            code: 'polyansky',
            checkpointsDone: 2,
            checkpointsTotal: 3,
            spiralsFull: null,
            spiralsMinFull: null,
            dealProgress,
            capsApplied: 0,
        },
    });

const many = (
    prefix: string,
    managerId: string,
    count: number,
    score: number,
    dealProgress: number,
): AnalyticsCallLiteRow[] =>
    Array.from({ length: count }, (_, index) =>
        withProgress(`${prefix}${index + 1}`, managerId, score, dealProgress),
    );

describe('buildQualityProgressDto', () => {
    it('клетки с названиями, строки по менеджерам, счётчики camelCase, объяснение словами', () => {
        const dto = buildQualityProgressDto(
            [
                ...many('s', '20', 6, 80, 5),
                ...many('b', '20', 2, 40, 4),
                ...many('w', '10', 3, 30, 1),
            ],
            THRESHOLDS,
        );
        expect(dto?.thresholds).toEqual(THRESHOLDS);
        expect(dto?.quadrants.map(item => item.code)).toEqual([
            'strong',
            'quality_no_progress',
            'progress_no_quality',
            'weak',
        ]);
        expect(dto?.quadrants[2]).toMatchObject({
            title: 'Купил бы и без менеджера',
        });
        expect(dto?.managers.map(item => item.managerId)).toEqual(['10', '20']);

        const strong = dto?.managers[1];
        expect(strong?.counts).toEqual({
            strong: 6,
            qualityNoProgress: 0,
            progressNoQuality: 2,
            weak: 0,
        });
        expect(strong?.position).toBe('strong');
        expect(strong?.progressNoQualityCallIds).toEqual(['b1', 'b2']);
        expect(strong?.explanation).toBe(
            'Звонков с продвижением: 8; оценка 7,0 из 10, продвижение 4,8 из 5. ' +
                'Качество и движение — 6, качество без движения — 0, купил бы и без менеджера — 2, слабые — 0.',
        );

        const weak = dto?.managers[0];
        expect(weak?.position).toBeNull();
        expect(weak?.explanation).toBe(
            'мало данных: 3 звонка с продвижением сделки',
        );

        expect(dto?.totals.n).toBe(11);
        expect(dto?.totals.counts.weak).toBe(3);
    });

    it('без звонков с продвижением — null', () => {
        expect(
            buildQualityProgressDto(
                [
                    withProgress('a', '10', 70, null),
                    liteRow({ transcriptionId: 'b' }),
                ],
                THRESHOLDS,
            ),
        ).toBeNull();
    });

    it('у каждой клетки есть название и «что сделать»', () => {
        for (const text of Object.values(QUALITY_PROGRESS_QUADRANT_TEXTS)) {
            expect(text.title.trim()).not.toBe('');
            expect(text.hint.trim()).not.toBe('');
            expect(text.hint).not.toMatch(/[a-z_]{4,}/);
        }
        expect(
            qualityProgressExplanation({
                n: 2,
                score: { value: null, n: 2, confidence: { level: 'none' } },
                dealProgress: {
                    value: null,
                    n: 2,
                    confidence: { level: 'none' },
                },
                counts: {
                    strong: 0,
                    quality_no_progress: 0,
                    progress_no_quality: 0,
                    weak: 2,
                },
                position: null,
            }),
        ).toBe('мало данных: 2 звонка с продвижением сделки');
    });
});
