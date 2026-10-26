import type { BitrixService } from '@lib/bitrix';
import type { IBitrixBatchResponseResult } from '@lib/bitrix/core/interface/bitrix-api-http.intterface';
import { SupportLineReader } from '../infrastructure/support-line.reader';
import { collectBatchOutcome } from '../infrastructure/support-batch.util';
import { liveSession, liveTail } from './support-bitrix-fixtures';
import { T0 } from './support-fixtures';

type BatchChunk = Pick<IBitrixBatchResponseResult, 'result' | 'result_error'>;

/**
 * Битрикс-инстанс с одной очередью команд: команды обеих пачек копятся
 * в ОДНОМ объекте и отдаются по очереди ответов — как в живом инстансе.
 */
function fakeBitrix(responses: BatchChunk[][]) {
    const queued: Array<{ key: string; method: string; data: unknown }> = [];
    const callBatchWithConcurrency = jest.fn(() => {
        const next = responses.shift() ?? [];
        return Promise.resolve(next as IBitrixBatchResponseResult[]);
    });
    const bitrix = {
        api: { callBatchWithConcurrency },
        batch: {
            imOpenlinesV2Session: {
                list: jest.fn((key: string, data: unknown) =>
                    queued.push({ key, method: 'Session.list', data }),
                ),
            },
            imV2ChatMessage: {
                tail: jest.fn((key: string, data: unknown) =>
                    queued.push({ key, method: 'Chat.Message.tail', data }),
                ),
            },
        },
    };
    return {
        bitrix: bitrix as unknown as BitrixService,
        raw: bitrix,
        queued,
        callBatchWithConcurrency,
    };
}

describe('SupportLineReader', () => {
    it('две пачки: списки по статусам линии 9, затем хвосты открытых диалогов', async () => {
        const fake = fakeBitrix([
            [
                {
                    result: {
                        sessions_new: { sessions: [], hasNextPage: false },
                        sessions_answered: {
                            sessions: [liveSession()],
                            hasNextPage: false,
                        },
                    },
                    result_error: [],
                },
            ],
            [{ result: { tail_71: liveTail() }, result_error: [] }],
        ]);

        const result = await new SupportLineReader(fake.bitrix).readOpenDialogs(
            { lineId: 9, now: T0 },
        );

        expect(fake.queued.map(item => item.key)).toEqual([
            'sessions_new',
            'sessions_answered',
            'tail_71',
        ]);
        expect(fake.queued[0]?.data).toEqual(
            expect.objectContaining({
                configId: 9,
                status: 'new',
                limit: 200,
                dateCreateFrom: '2026-09-26T07:00:00.000Z',
            }),
        );
        expect(fake.queued[2]?.data).toEqual({
            dialogId: 'chat769',
            limit: 30,
        });
        expect(fake.callBatchWithConcurrency).toHaveBeenCalledWith(1, {
            strict: true,
        });
        expect(result.dialogs).toHaveLength(1);
        expect(result.dialogs[0]?.client.portal).toBe('alfacentr.bitrix24.ru');
        expect(result.warnings).toEqual([]);
    });

    it('линия 0 — все линии: configId не передаётся', async () => {
        const fake = fakeBitrix([[{ result: {}, result_error: [] }]]);
        const result = await new SupportLineReader(fake.bitrix).readOpenDialogs(
            { lineId: 0, now: T0 },
        );
        expect(fake.queued[0]?.data).not.toHaveProperty('configId');
        expect(result.dialogs).toEqual([]);
        expect(fake.callBatchWithConcurrency).toHaveBeenCalledTimes(1);
    });

    it('ошибка списка диалогов — исключение, а не «все ответили»', async () => {
        const fake = fakeBitrix([
            [
                {
                    result: {},
                    result_error: {
                        sessions_new: {
                            error: 'TARIFF_RESTRICTION',
                            error_description: 'not available',
                        },
                    },
                },
            ],
        ]);
        await expect(
            new SupportLineReader(fake.bitrix).readOpenDialogs({
                lineId: 9,
                now: T0,
            }),
        ).rejects.toThrow('TARIFF_RESTRICTION');
    });

    it('хвост не прочитан — диалог есть, замечание в отчёте', async () => {
        const fake = fakeBitrix([
            [
                {
                    result: {
                        sessions_new: {
                            sessions: [liveSession({ status: 'new' })],
                            hasNextPage: true,
                        },
                        sessions_answered: { sessions: [], hasNextPage: false },
                    },
                    result_error: [],
                },
            ],
            [
                {
                    result: {},
                    result_error: {
                        tail_71: {
                            error: 'ACCESS_ERROR',
                            error_description: 'no access',
                        },
                    },
                },
            ],
        ]);
        const result = await new SupportLineReader(fake.bitrix).readOpenDialogs(
            { lineId: 9, now: T0 },
        );
        expect(result.dialogs).toHaveLength(1);
        expect(result.dialogs[0]?.messages).toEqual([]);
        expect(result.warnings).toEqual([
            'открытых диалогов в статусе new больше 200 — разобраны первые',
            'переписка диалога 71 не прочитана: ACCESS_ERROR: no access',
        ]);
    });

    it('один диалог в двух статусах (сменился между запросами) — один раз', async () => {
        const fake = fakeBitrix([
            [
                {
                    result: {
                        sessions_new: {
                            sessions: [liveSession({ status: 'new' })],
                            hasNextPage: false,
                        },
                        sessions_answered: {
                            sessions: [liveSession()],
                            hasNextPage: false,
                        },
                    },
                    result_error: [],
                },
            ],
            [{ result: { tail_71: liveTail() }, result_error: [] }],
        ]);
        const result = await new SupportLineReader(fake.bitrix).readOpenDialogs(
            { lineId: 9, now: T0 },
        );
        expect(result.dialogs).toHaveLength(1);
        expect(fake.queued.filter(item => item.key === 'tail_71')).toHaveLength(
            1,
        );
    });
});

describe('collectBatchOutcome', () => {
    it('склеивает чанки и ошибки', () => {
        const outcome = collectBatchOutcome([
            {
                result: { a: 1 },
                result_error: [],
                result_total: [],
                result_next: [],
            },
            {
                result: { b: 2 },
                result_error: { c: { error: 'X', error_description: 'y' } },
                result_total: [],
                result_next: [],
            },
        ]);
        expect(outcome).toEqual({
            results: { a: 1, b: 2 },
            errors: { c: 'X: y' },
        });
    });
});
