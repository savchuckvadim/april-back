import {
    AI_ANALYTICS_CALL_REVIEW_LIMITS,
    callReviewObjectOf,
    callReviewScoreOf,
    parseCallReviewPayload,
} from '../contracts/call-review.types';

const valid = {
    agree: false,
    leaderScore: 4,
    aiScore: 6.4,
    analysisId: '900',
    items: [
        { kind: 'section', ref: 'NEEDS', label: 'Потребности', comment: 'нет' },
    ],
    comment: 'Оценка завышена',
    authorRole: 'leader',
    authorName: 'Петров Пётр',
};

describe('отзыв руководителя о разборе (call_review)', () => {
    it('верная нагрузка читается как есть', () => {
        expect(parseCallReviewPayload(valid)).toEqual(valid);
        expect(callReviewObjectOf('10245')).toBe('call:10245');
    });

    it('чужая форма — null: нет согласия, роли автора или записи разбора', () => {
        expect(parseCallReviewPayload(null)).toBeNull();
        expect(parseCallReviewPayload([])).toBeNull();
        expect(parseCallReviewPayload({ ...valid, agree: 'да' })).toBeNull();
        expect(
            parseCallReviewPayload({ ...valid, authorRole: 'manager' }),
        ).toBeNull();
        expect(parseCallReviewPayload({ ...valid, analysisId: '' })).toBeNull();
    });

    it('оценки вне шкалы — null, пункты чужого вида пропускаются, тексты режутся', () => {
        const parsed = parseCallReviewPayload({
            ...valid,
            leaderScore: 11,
            aiScore: -1,
            items: [
                { kind: 'unknown', ref: 'x' },
                { kind: 'fact', ref: 'r', label: 'l'.repeat(400) },
                ...Array.from({ length: 40 }, () => ({
                    kind: 'objection',
                    ref: 'o',
                })),
            ],
            comment: 'к'.repeat(AI_ANALYTICS_CALL_REVIEW_LIMITS.comment + 5),
        });
        expect(parsed?.leaderScore).toBeNull();
        expect(parsed?.aiScore).toBeNull();
        expect(parsed?.items[0]).toEqual({
            kind: 'fact',
            ref: 'r',
            label: 'l'.repeat(AI_ANALYTICS_CALL_REVIEW_LIMITS.itemLabel),
            comment: '',
        });
        expect(parsed?.items.length).toBeLessThanOrEqual(
            AI_ANALYTICS_CALL_REVIEW_LIMITS.items,
        );
        expect(parsed?.comment).toHaveLength(
            AI_ANALYTICS_CALL_REVIEW_LIMITS.comment,
        );
    });

    it('шкала оценки руководителя 1–10', () => {
        expect(callReviewScoreOf(1)).toBe(1);
        expect(callReviewScoreOf(10)).toBe(10);
        expect(callReviewScoreOf(0)).toBeNull();
        expect(callReviewScoreOf('5')).toBeNull();
    });
});
