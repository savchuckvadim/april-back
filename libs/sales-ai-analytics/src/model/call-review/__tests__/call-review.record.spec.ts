import {
    callReviewUserIdOf,
    latestCallReviews,
    parseCallReviewRecord,
} from '../call-review.record';
import { reviewPayload, reviewRecord } from './call-review.fixtures';

describe('parseCallReviewRecord', () => {
    it('актуальная запись call_review → отзыв с автором, звонком и менеджером', () => {
        const review = parseCallReviewRecord(
            reviewRecord('5', {
                payload: reviewPayload({ agree: false, leaderScore: 4 }),
            }),
        );

        expect(review).toMatchObject({
            id: '5',
            authorId: '12',
            transcriptionId: '10245',
            managerId: '447',
            agree: false,
            leaderScore: 4,
            aiScore: 6.4,
            authorRole: 'leader',
        });
    });

    it('замещённая запись (superseded) не читается', () => {
        expect(
            parseCallReviewRecord(reviewRecord('5', { status: 'superseded' })),
        ).toBeNull();
    });

    it('чужой вид обратной связи и чужая нагрузка — null', () => {
        expect(
            parseCallReviewRecord(reviewRecord('5', { kind: 'rop_mark' })),
        ).toBeNull();
        expect(
            parseCallReviewRecord(
                reviewRecord('6', { payload: { comment: 'без согласия' } }),
            ),
        ).toBeNull();
    });

    it('без автора — null; звонок без номера в нагрузке берётся из колонки', () => {
        expect(
            parseCallReviewRecord(reviewRecord('5', { author: 'abc' })),
        ).toBeNull();
        const record = reviewRecord('7');
        record.user_result = {
            ...(record.user_result as Record<string, unknown>),
            transcriptionId: null,
        };
        record.transcription_id = '555';

        expect(parseCallReviewRecord(record)?.transcriptionId).toBe('555');
    });

    it('id пользователя — целое больше нуля', () => {
        expect(callReviewUserIdOf(' 12 ')).toBe('12');
        expect(callReviewUserIdOf(12)).toBe('12');
        expect(callReviewUserIdOf('0')).toBeNull();
        expect(callReviewUserIdOf('1.5')).toBeNull();
        expect(callReviewUserIdOf(null)).toBeNull();
    });
});

describe('latestCallReviews', () => {
    it('на автора и звонок — один самый свежий по id, новые сверху, замещённые не считаются', () => {
        const reviews = latestCallReviews([
            reviewRecord('10', { at: '2026-11-18T08:00:00.000Z' }),
            reviewRecord('12', { at: '2026-11-18T10:00:00.000Z' }),
            reviewRecord('11', {
                at: '2026-11-18T09:00:00.000Z',
                author: '13',
            }),
            reviewRecord('13', {
                at: '2026-11-18T11:00:00.000Z',
                status: 'superseded',
            }),
            reviewRecord('14', {
                at: '2026-11-18T07:00:00.000Z',
                transcriptionId: '777',
            }),
        ]);

        expect(reviews.map(review => review.id)).toEqual(['12', '11', '14']);
    });
});
