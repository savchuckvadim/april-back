import type { AiAnalyticsCallReviewItem } from '../../../contracts/call-review.types';
import {
    summarizeCallReviews,
    topCallReviewItems,
    type CallReviewStatsInput,
} from '../call-review.stats';

const item = (
    kind: AiAnalyticsCallReviewItem['kind'],
    label: string,
    ref = 'code',
): AiAnalyticsCallReviewItem => ({ kind, ref, label, comment: '' });

const review = (
    fields: Partial<CallReviewStatsInput> = {},
): CallReviewStatsInput => ({
    agree: true,
    aiScore: 6,
    leaderScore: 6,
    items: [],
    ...fields,
});

describe('summarizeCallReviews', () => {
    it('пусто — нули и null вместо средних, все виды «не так» с нулями', () => {
        const stats = summarizeCallReviews([]);

        expect(stats).toMatchObject({
            total: 0,
            disagree: 0,
            disagreePct: null,
            avgAiScore: null,
            avgLeaderScore: null,
            avgScoreDiff: null,
            topItems: [],
        });
        expect(stats.itemKinds.map(kind => [kind.kind, kind.count])).toEqual([
            ['section', 0],
            ['objection', 0],
            ['methodology', 0],
            ['fact', 0],
            ['call_type', 0],
        ]);
    });

    it('несогласия, средние оценки и разница «руководитель − AI» только по парам', () => {
        const stats = summarizeCallReviews([
            review({ agree: false, aiScore: 8, leaderScore: 5 }),
            review({ agree: false, aiScore: 7.2, leaderScore: null }),
            review({ agree: true, aiScore: null, leaderScore: 6 }),
        ]);

        expect(stats.total).toBe(3);
        expect(stats.disagree).toBe(2);
        expect(stats.disagreePct).toBe(66.7);
        expect(stats.avgAiScore).toBe(7.6);
        expect(stats.avgLeaderScore).toBe(5.5);
        expect(stats.avgScoreDiff).toBe(-3);
    });

    it('замечания «не так» считаются по видам, подписи — словами', () => {
        const stats = summarizeCallReviews([
            review({
                items: [
                    item('section', 'Выявление потребности'),
                    item('objection', '«Дорого»'),
                ],
            }),
            review({ items: [item('section', 'Презентация')] }),
        ]);

        expect(stats.itemKinds[0]).toEqual({
            kind: 'section',
            title: 'раздел',
            count: 2,
        });
        expect(stats.itemKinds[1]).toMatchObject({
            kind: 'objection',
            title: 'возражение',
            count: 1,
        });
    });
});

describe('topCallReviewItems', () => {
    it('одна подпись без учёта регистра и пробелов — один пункт; сначала частые', () => {
        const top = topCallReviewItems([
            review({ items: [item('section', 'Выявление  потребности')] }),
            review({ items: [item('section', 'выявление потребности')] }),
            review({ items: [item('methodology', 'Следующий шаг')] }),
            review({ items: [item('objection', 'Следующий шаг')] }),
        ]);

        expect(top[0]).toEqual({
            kind: 'section',
            kindTitle: 'раздел',
            label: 'Выявление потребности',
            count: 2,
        });
        expect(top.slice(1).map(entry => entry.kind)).toEqual([
            'objection',
            'methodology',
        ]);
    });

    it('пустая подпись заменяется кодом пункта; топ режется по пределу', () => {
        const reviews = Array.from({ length: 12 }, (_, index) =>
            review({ items: [item('fact', '', `fact-${index}`)] }),
        );

        const top = topCallReviewItems(reviews, 10);

        expect(top).toHaveLength(10);
        expect(top[0].label).toMatch(/^fact-/);
    });
});
