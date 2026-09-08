import 'reflect-metadata';
import { AI_ANALYTICS_FEEDBACK_TYPE } from '@lib/sales-ai-analytics';
import { AI_ROP_MARK_RECORD } from '../constants/ai-rop-mark.const';
import {
    AiAnalyticsRopMarkStore,
    parseRopMarkPayload,
    parseRopMarkPick,
} from '../store/ai-analytics-rop-mark.store';

const DOMAIN = 'a.bitrix24.ru';
const WEEK = '2026-W36';
const CREATED = new Date('2026-09-07T00:15:00Z');

/** Запись ais в объёме, который читает стор. */
const aisRecord = (overrides: Record<string, unknown> = {}) => ({
    id: '1',
    createdAt: CREATED,
    status: 'done',
    type: AI_ROP_MARK_RECORD.TYPE,
    activity_id: WEEK,
    transcription_id: '',
    user_result: {},
    ...overrides,
});

const pickPayload = {
    weekKey: WEEK,
    seed: 42,
    generatedAt: CREATED.toISOString(),
    calls: [
        {
            transcriptionId: '103',
            managerId: '13',
            callType: 'presentation',
            score: 92,
            reason: 'best_score',
        },
    ],
};

const markResult = {
    kind: 'rop_mark',
    object: 'call:103',
    managerId: '13',
    transcriptionId: '103',
    requesterUserId: '447',
    reason: 'best_score',
    payload: {
        agree: false,
        ropScore: 6,
        sections: ['NEEDS'],
        why: 'потребность не выявлена',
        howTo: 'два вопроса',
        reason: 'best_score',
        blind: true,
        weekKey: WEEK,
    },
};

function makeStore(records: object[] = []) {
    const aiService = {
        create: jest.fn().mockResolvedValue({ id: '900' }),
        update: jest.fn().mockResolvedValue({ id: '1' }),
        findByDomainTypeKeys: jest.fn().mockResolvedValue(records),
    };
    return {
        store: new AiAnalyticsRopMarkStore(aiService as never),
        aiService,
    };
}

describe('AiAnalyticsRopMarkStore', () => {
    it('savePick пишет запись недели и гасит прошлый подбор', async () => {
        const { store, aiService } = makeStore([aisRecord()]);

        const result = await store.savePick({
            domain: DOMAIN,
            weekKey: WEEK,
            seed: 42,
            generatedAt: CREATED.toISOString(),
            calls: pickPayload.calls.map(call => ({
                ...call,
                reason: 'best_score' as const,
            })),
        });

        expect(result).toEqual({ id: '900', supersededIds: ['1'] });
        expect(aiService.update).toHaveBeenCalledWith('1', {
            status: 'superseded',
        });
        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                type: AI_ROP_MARK_RECORD.TYPE,
                activity_id: WEEK,
                status: 'done',
                domain: DOMAIN,
            }),
        );
    });

    it('loadPick берёт свежую запись и разбирает нагрузку', async () => {
        const { store } = makeStore([
            aisRecord({
                id: '1',
                createdAt: new Date('2026-09-01T00:00:00Z'),
                user_result: { weekKey: WEEK, calls: [] },
            }),
            aisRecord({ id: '2', user_result: pickPayload }),
        ]);

        const pick = await store.loadPick(DOMAIN, WEEK);

        expect(pick).toMatchObject({ id: '2', seed: 42 });
        expect(pick?.calls).toHaveLength(1);
    });

    it('записи со статусом superseded в выборку не попадают', async () => {
        const { store } = makeStore([
            aisRecord({ status: 'superseded', user_result: pickPayload }),
        ]);

        expect(await store.loadPick(DOMAIN, WEEK)).toBeNull();
    });

    it('saveMark пишет метку с ключом недели и id транскрипции, прошлую гасит', async () => {
        const { store, aiService } = makeStore([
            aisRecord({
                id: '5',
                type: AI_ANALYTICS_FEEDBACK_TYPE,
                transcription_id: '103',
                user_result: markResult,
            }),
        ]);

        const result = await store.saveMark({
            domain: DOMAIN,
            transcriptionId: '103',
            managerId: '13',
            requesterUserId: '447',
            weekKey: WEEK,
            reason: 'best_score',
            agree: true,
            ropScore: 8,
            sections: [],
            why: '',
            howTo: '',
            blind: false,
        });

        expect(result.replacedIds).toEqual(['5']);
        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                type: AI_ANALYTICS_FEEDBACK_TYPE,
                activity_id: WEEK,
                transcription_id: '103',
                user_id: 447,
            }),
        );
    });

    it('listMarks возвращает только записи вида rop_mark', async () => {
        const { store } = makeStore([
            aisRecord({
                id: '5',
                type: AI_ANALYTICS_FEEDBACK_TYPE,
                transcription_id: '103',
                user_result: markResult,
            }),
            aisRecord({
                id: '6',
                type: AI_ANALYTICS_FEEDBACK_TYPE,
                user_result: { kind: 'useful', object: 'pulse' },
            }),
        ]);

        const marks = await store.listMarks(DOMAIN, WEEK);

        expect(marks).toHaveLength(1);
        expect(marks[0]).toMatchObject({
            transcriptionId: '103',
            managerId: '13',
            requesterUserId: '447',
            agree: false,
            blind: true,
        });
    });

    it('разбор чужих форм: не падает, отдаёт null', () => {
        expect(parseRopMarkPick(null)).toBeNull();
        expect(parseRopMarkPick({ weekKey: WEEK })).toBeNull();
        expect(parseRopMarkPayload({ kind: 'useful' })).toBeNull();
        expect(
            parseRopMarkPayload({ kind: 'rop_mark', payload: { reason: 'x' } }),
        ).toBeNull();
    });

    it('строка подбора без причины или без менеджера отбрасывается', () => {
        const parsed = parseRopMarkPick({
            weekKey: WEEK,
            seed: 1,
            generatedAt: '',
            calls: [
                { transcriptionId: '1', managerId: '2' },
                { transcriptionId: '3', reason: 'random' },
                { transcriptionId: '4', managerId: '5', reason: 'random' },
            ],
        });

        expect(parsed?.calls.map(call => call.transcriptionId)).toEqual(['4']);
    });
});
