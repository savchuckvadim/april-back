import {
    AI_ANALYTICS_FEEDBACK_APP,
    AI_ANALYTICS_FEEDBACK_KINDS,
    AI_ANALYTICS_FEEDBACK_PROVIDER,
    AI_ANALYTICS_FEEDBACK_TYPE,
} from '@lib/sales-ai-analytics';
import {
    AiAnalyticsFeedbackStore,
    parseFeedbackPayload,
} from '../store/ai-analytics-feedback.store';

function makeStore(records: object[] = []) {
    const aiService = {
        create: jest.fn((input: Record<string, unknown>) =>
            Promise.resolve({ id: '9001', ...input }),
        ),
        findByDomainTypesInPeriod: jest.fn().mockResolvedValue(records),
    };
    return {
        store: new AiAnalyticsFeedbackStore(aiService as never),
        aiService,
    };
}

const created = new Date('2026-09-03T10:00:00Z');

describe('AiAnalyticsFeedbackStore (ais, контракт 4)', () => {
    it('add пишет запись с фиксированными type/app/provider и payload контракта', async () => {
        const { store, aiService } = makeStore();
        const id = await store.add({
            domain: 'd',
            kind: 'disagree',
            object: 'call:1024',
            managerId: '10',
            transcriptionId: '1024',
            requesterUserId: '447',
            reason: 'ошибка',
            payload: { section: 'NEEDS' },
        });
        expect(id).toBe('9001');
        expect(aiService.create).toHaveBeenCalledWith({
            provider: AI_ANALYTICS_FEEDBACK_PROVIDER,
            app: AI_ANALYTICS_FEEDBACK_APP,
            type: AI_ANALYTICS_FEEDBACK_TYPE,
            status: 'done',
            result: 'disagree: call:1024',
            user_result: {
                kind: 'disagree',
                object: 'call:1024',
                managerId: '10',
                transcriptionId: '1024',
                requesterUserId: '447',
                reason: 'ошибка',
                payload: { section: 'NEEDS' },
            },
            domain: 'd',
            transcription_id: '1024',
            user_id: 447,
        });
    });

    it('add без звонка и requester — без transcription_id/user_id', async () => {
        const { store, aiService } = makeStore();
        await store.add({
            domain: 'd',
            kind: 'view',
            object: 'pulse',
            managerId: null,
            transcriptionId: null,
            requesterUserId: null,
            reason: null,
        });
        const [arg] = aiService.create.mock.calls[0];
        expect(arg).not.toHaveProperty('transcription_id');
        expect(arg).not.toHaveProperty('user_id');
        expect(arg.user_result).toEqual({
            kind: 'view',
            object: 'pulse',
            managerId: null,
            transcriptionId: null,
            requesterUserId: null,
            reason: null,
        });
    });

    it('listInPeriod читает только записи типа контракта, парсит payload, фильтрует по менеджеру', async () => {
        const { store, aiService } = makeStore([
            {
                id: '1',
                createdAt: created,
                user_result: {
                    kind: 'useful',
                    object: 'agenda',
                    managerId: '10',
                },
            },
            {
                id: '2',
                createdAt: created,
                user_result: {
                    kind: 'disagree',
                    object: 'call:5',
                    managerId: '20',
                    reason: 'x',
                },
            },
            {
                id: '3',
                createdAt: created,
                user_result: { kind: 'like', object: 'x' },
            },
            { id: '4', createdAt: created, user_result: null },
        ]);
        const from = new Date('2026-09-01T00:00:00Z');
        const to = new Date('2026-09-30T00:00:00Z');

        const all = await store.listInPeriod('d', from, to);
        expect(aiService.findByDomainTypesInPeriod).toHaveBeenCalledWith(
            'd',
            [AI_ANALYTICS_FEEDBACK_TYPE],
            from,
            to,
        );
        expect(all.map(record => record.id)).toEqual(['1', '2']);
        expect(all[0]).toEqual({
            id: '1',
            createdAt: created,
            kind: 'useful',
            object: 'agenda',
            managerId: '10',
            transcriptionId: null,
            requesterUserId: null,
            reason: null,
        });

        const forManager = await store.listInPeriod('d', from, to, '20');
        expect(forManager.map(record => record.id)).toEqual(['2']);
    });

    it('parseFeedbackPayload: kind только из as const-справочника', () => {
        for (const kind of AI_ANALYTICS_FEEDBACK_KINDS) {
            expect(parseFeedbackPayload({ kind, object: 'o' })?.kind).toBe(
                kind,
            );
        }
        expect(parseFeedbackPayload({ kind: 'other', object: 'o' })).toBeNull();
        expect(parseFeedbackPayload({ kind: 'view' })).toBeNull();
        expect(parseFeedbackPayload('строка')).toBeNull();
    });
});
