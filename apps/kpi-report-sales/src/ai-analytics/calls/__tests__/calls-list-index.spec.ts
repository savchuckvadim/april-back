import type { DatedLiteRow } from '@lib/sales-ai-analytics';
import type { PBXService } from '@/modules/pbx';
import type { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import type { CallsLoader } from '../../domain/loaders/calls.loader';
import type { SettingsLoader } from '../../domain/loaders/settings.loader';
import type {
    AiAnalyticsFeedbackRecord,
    AiAnalyticsFeedbackStore,
} from '../../store/ai-analytics-feedback.store';
import {
    buildCallListKey,
    CallListIndexLoader,
} from '../calls-list-index.loader';
import { groupCallReviews, toCallListRows } from '../calls-list-index.mapper';

const liteOf = (
    transcriptionId: string,
    fields: Partial<DatedLiteRow> = {},
): DatedLiteRow =>
    ({
        transcriptionId,
        managerId: '447',
        callStartedAt: new Date('2026-11-10T08:00:00.000Z'),
        durationSec: 95.6,
        callType: 'cold',
        analysisPresent: true,
        score: 64,
        ...fields,
    }) as DatedLiteRow;

const payloadOf = (fields: Record<string, unknown> = {}) => ({
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

const feedbackOf = (
    id: string,
    fields: Partial<AiAnalyticsFeedbackRecord> = {},
): AiAnalyticsFeedbackRecord => ({
    id,
    createdAt: new Date('2026-11-11T08:00:00.000Z'),
    status: 'done',
    kind: 'call_review',
    object: 'call:1',
    managerId: '447',
    transcriptionId: '1',
    requesterUserId: '10',
    reason: null,
    payload: payloadOf(),
    ...fields,
});

describe('выборка периода: строки и отзывы', () => {
    it('только звонки с разбором, оценка — по шкале витрины, новые сверху', () => {
        const rows = toCallListRows([
            liteOf('1'),
            liteOf('2', { analysisPresent: false }),
            liteOf('3', {
                callStartedAt: new Date('2026-11-12T08:00:00.000Z'),
                score: null,
                durationSec: null,
                managerId: '0447',
            }),
        ]);
        expect(rows).toEqual([
            {
                transcriptionId: '3',
                managerId: '447',
                startedAt: '2026-11-12T08:00:00.000Z',
                durationSec: null,
                callType: 'cold',
                aiScore: null,
            },
            {
                transcriptionId: '1',
                managerId: '447',
                startedAt: '2026-11-10T08:00:00.000Z',
                durationSec: 96,
                callType: 'cold',
                aiScore: 6.4,
            },
        ]);
    });

    it('отзывы: только call_review, по одному свежему на автора и звонок', () => {
        const grouped = groupCallReviews([
            feedbackOf('5', { payload: payloadOf({ agree: false }) }),
            feedbackOf('7', { payload: payloadOf({ leaderScore: 9 }) }),
            feedbackOf('6', { requesterUserId: '11' }),
            feedbackOf('8', { kind: 'disagree' }),
            feedbackOf('9', { payload: { agree: true } }),
            feedbackOf('10', { transcriptionId: null }),
            feedbackOf('11', { transcriptionId: '2' }),
        ]);
        expect(Object.keys(grouped).sort()).toEqual(['1', '2']);
        expect(grouped['1']).toEqual([
            {
                authorId: '10',
                agree: true,
                leaderScore: 9,
                createdAt: '2026-11-11T08:00:00.000Z',
            },
            {
                authorId: '11',
                agree: true,
                leaderScore: 7,
                createdAt: '2026-11-11T08:00:00.000Z',
            },
        ]);
    });
});

describe('CallListIndexLoader', () => {
    function harness() {
        const settings = {
            load: jest.fn(() =>
                Promise.resolve({ calendar: { timeZone: 'Europe/Moscow' } }),
            ),
        };
        const calls = {
            loadLite: jest.fn(() => Promise.resolve([liteOf('1')])),
        };
        const feedback = {
            listInPeriod: jest.fn(() => Promise.resolve([feedbackOf('5')])),
        };
        const pbx = {
            init: jest.fn(() =>
                Promise.resolve({
                    bitrix: {
                        user: {
                            get: jest.fn(() =>
                                Promise.resolve({
                                    result: [
                                        {
                                            ID: '447',
                                            NAME: 'Мария',
                                            LAST_NAME: 'Иванова',
                                        },
                                    ],
                                }),
                            ),
                        },
                    },
                }),
            ),
        };
        const cache = {
            remember: jest.fn(
                async (
                    _key: string,
                    _ttl: number,
                    compute: () => Promise<unknown>,
                ) => ({
                    value: await compute(),
                    fromCache: false,
                }),
            ),
        };
        const loader = new CallListIndexLoader(
            settings as unknown as SettingsLoader,
            calls as unknown as CallsLoader,
            feedback as unknown as AiAnalyticsFeedbackStore,
            pbx as unknown as PBXService,
            cache as unknown as AiAnalyticsCacheService,
        );
        return { loader, calls, feedback, cache, pbx };
    }

    it('ключ кэша — портал и период, срок — 5 минут, только Redis', async () => {
        const { loader, cache } = harness();
        await loader.load('gsr.bitrix24.ru', '2026-11-01', '2026-11-19');
        expect(cache.remember).toHaveBeenCalledWith(
            'sales-ai-analytics:v1:gsr.bitrix24.ru:call-list:v1:2026-11-01_2026-11-19',
            300,
            expect.any(Function),
            { volatile: true },
        );
        expect(buildCallListKey('d', 'a', 'b')).toBe(
            'sales-ai-analytics:v1:d:call-list:v1:a_b',
        );
    });

    it('звонки — за дни портала, отзывы — от начала периода до «сейчас»', async () => {
        const { loader, calls, feedback } = harness();
        const now = new Date('2026-12-05T10:00:00.000Z');

        const index = await loader.load(
            'gsr.bitrix24.ru',
            '2026-11-01',
            '2026-11-19',
            now,
        );

        expect(calls.loadLite).toHaveBeenCalledWith(
            'gsr.bitrix24.ru',
            new Date('2026-10-31T21:00:00.000Z'),
            expect.any(Date),
        );
        expect(feedback.listInPeriod).toHaveBeenCalledWith(
            'gsr.bitrix24.ru',
            new Date('2026-10-31T21:00:00.000Z'),
            now,
        );
        expect(index.rows.map(row => row.transcriptionId)).toEqual(['1']);
        expect(index.reviews['1']).toHaveLength(1);
        expect(index.managerNames).toEqual({ '447': 'Иванова Мария' });
    });

    it('имена не прочитались — выборка без имён, не ошибка', async () => {
        const { loader, pbx } = harness();
        pbx.init.mockRejectedValueOnce(new Error('портал недоступен'));
        const index = await loader.load('d', '2026-11-01', '2026-11-02');
        expect(index.managerNames).toEqual({});
        expect(index.rows).toHaveLength(1);
    });
});
