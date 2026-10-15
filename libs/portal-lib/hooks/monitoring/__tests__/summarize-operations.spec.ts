import {
    parseHookOperation,
    summarizeOperations,
    summarizeResult,
} from '../lib/summarize-operations';

const op = (patch: Record<string, unknown>) => ({
    operationId: 'op-1',
    hook: 'lead-to-work',
    domain: 'x.bitrix24.ru',
    source: 'robot',
    status: 'done',
    itemsCount: 1,
    queuedAt: '2026-10-15T10:00:00.000Z',
    startedAt: '2026-10-15T10:00:01.000Z',
    finishedAt: '2026-10-15T10:00:05.000Z',
    error: null,
    result: null,
    ...patch,
});

describe('parseHookOperation', () => {
    it('разбирает запись и считает предупреждения результата', () => {
        const view = parseHookOperation(
            op({ result: { warnings: ['a', 'b'], created: 1, reused: false } }),
            new Date('2026-10-15T10:00:05.000Z'),
        );
        expect(view?.warningsCount).toBe(2);
        expect(view?.resultSummary).toBe('created: 1 · reused: false');
        expect(view?.updatedAt).toBe('2026-10-15T10:00:05.000Z');
    });

    it('повреждённые записи и неизвестные статусы пропускаются', () => {
        expect(parseHookOperation(null, null)).toBeNull();
        expect(parseHookOperation({ hook: 'x' }, null)).toBeNull();
        expect(parseHookOperation(op({ status: 'weird' }), null)).toBeNull();
    });
});

describe('summarizeResult', () => {
    it('длинные строки и вложенные объекты не попадают в выжимку', () => {
        expect(
            summarizeResult({
                note: 'x'.repeat(41),
                nested: { a: 1 },
                items: [1, 2],
            }),
        ).toBe('items: 2');
        expect(summarizeResult('str')).toBeNull();
    });
});

describe('summarizeOperations', () => {
    it('считает статусы, группирует по хукам и находит последнюю активность', () => {
        const rows = [
            parseHookOperation(op({}), null),
            parseHookOperation(
                op({
                    operationId: 'op-2',
                    status: 'failed',
                    error: 'boom',
                    finishedAt: '2026-10-15T11:00:00.000Z',
                }),
                null,
            ),
            parseHookOperation(
                op({
                    operationId: 'op-3',
                    hook: 'join-to-main',
                    status: 'running',
                    finishedAt: null,
                }),
                null,
            ),
        ].filter((row): row is NonNullable<typeof row> => row !== null);

        const summary = summarizeOperations(rows);
        expect(summary.total).toBe(3);
        expect(summary.done).toBe(1);
        expect(summary.failed).toBe(1);
        expect(summary.running).toBe(1);
        expect(summary.lastActivityAt).toBe('2026-10-15T11:00:00.000Z');
        expect(summary.byHook.map(h => h.hook)).toEqual([
            'join-to-main',
            'lead-to-work',
        ]);
        expect(summary.byHook[1]).toMatchObject({
            total: 2,
            failed: 1,
            running: 0,
        });
    });

    it('пустой список — нули', () => {
        expect(summarizeOperations([])).toEqual({
            total: 0,
            queued: 0,
            running: 0,
            done: 0,
            failed: 0,
            byHook: [],
            lastActivityAt: null,
        });
    });
});
