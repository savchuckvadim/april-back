import type { AiEntityDto, AiService } from '@lib/call-lib';
import { AiAnalyticsCallReviewStore } from '../store/ai-analytics-call-review.store';
import { AiAnalyticsFeedbackStore } from '../store/ai-analytics-feedback.store';

const DOMAIN = 'gsr.bitrix24.ru';

const review = (fields: Record<string, unknown> = {}) => ({
    agree: true,
    leaderScore: 7,
    aiScore: 6.4,
    analysisId: '900',
    items: [],
    comment: '',
    authorRole: 'leader',
    authorName: 'Петров Пётр',
    ...fields,
});

const recordOf = (
    id: string,
    author: string,
    fields: Partial<AiEntityDto> = {},
    kind = 'call_review',
    payload: Record<string, unknown> = review(),
): AiEntityDto =>
    ({
        id,
        type: 'ai-analytics-feedback',
        status: 'done',
        transcription_id: '10245',
        createdAt: new Date(`2026-11-19T08:0${id.slice(-1)}:00.000Z`),
        user_result: {
            kind,
            object: 'call:10245',
            managerId: '447',
            transcriptionId: '10245',
            requesterUserId: author,
            reason: null,
            payload,
        },
        ...fields,
    }) as unknown as AiEntityDto;

function harness(records: AiEntityDto[]) {
    const ai = {
        findByDomainTypeKeys: jest.fn(() => Promise.resolve(records)),
        create: jest.fn(() => Promise.resolve({ id: '99' })),
        update: jest.fn(() => Promise.resolve({})),
    };
    const feedback = new AiAnalyticsFeedbackStore(ai as unknown as AiService);
    const store = new AiAnalyticsCallReviewStore(
        ai as unknown as AiService,
        feedback,
    );
    return { store, ai };
}

describe('AiAnalyticsCallReviewStore', () => {
    it('по звонку — актуальные отзывы, по одному свежему на автора, новые сверху', async () => {
        const { store, ai } = harness([
            recordOf('1', '10'),
            recordOf('3', '10', {}, 'call_review', review({ agree: false })),
            recordOf('2', '11'),
            recordOf('4', '12', { status: 'superseded' }),
            recordOf('5', '13', {}, 'disagree'),
            recordOf('6', '14', {}, 'call_review', { agree: true }),
        ]);

        const reviews = await store.listForCall(DOMAIN, '10245');

        expect(ai.findByDomainTypeKeys).toHaveBeenCalledWith(
            DOMAIN,
            'ai-analytics-feedback',
            { transcriptionIds: ['10245'] },
        );
        expect(reviews.map(r => [r.id, r.authorId, r.agree])).toEqual([
            ['3', '10', false],
            ['2', '11', true],
        ]);
    });

    it('сохранение заменяет только мой прежний отзыв, чужие не трогает', async () => {
        const { store, ai } = harness([
            recordOf('1', '10'),
            recordOf('2', '11'),
            recordOf('3', '10', { status: 'superseded' }),
        ]);

        const result = await store.save({
            domain: DOMAIN,
            transcriptionId: '10245',
            managerId: '447',
            authorId: '10',
            review: {
                agree: false,
                leaderScore: 4,
                aiScore: 6.4,
                analysisId: '900',
                items: [],
                comment: 'Оценка завышена',
                authorRole: 'superuser',
                authorName: 'Петров Пётр',
            },
        });

        expect(result).toEqual({ id: '99', replacedIds: ['1'] });
        expect(ai.update).toHaveBeenCalledTimes(1);
        expect(ai.update).toHaveBeenCalledWith('1', { status: 'superseded' });
        const [created] = ai.create.mock.calls[0] as unknown as [
            {
                type: string;
                domain: string;
                transcription_id: string;
                user_id: number;
                user_result: Record<string, unknown>;
            },
        ];
        expect(created).toMatchObject({
            type: 'ai-analytics-feedback',
            domain: DOMAIN,
            transcription_id: '10245',
            user_id: 10,
        });
        expect(created.user_result).toMatchObject({
            kind: 'call_review',
            object: 'call:10245',
            managerId: '447',
            requesterUserId: '10',
            payload: {
                agree: false,
                authorRole: 'superuser',
                comment: 'Оценка завышена',
            },
        });
    });
});
