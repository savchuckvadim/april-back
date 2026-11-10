import {
    runReanalysisPool,
    type ReanalysisOneOutcome,
    type ReanalysisPoolOptions,
} from '../use-cases/call-report-reanalyze.pool';

/**
 * Пул переразбора: одновременность, заморозка серии сбоев после остановки,
 * бюджет времени и кооперативная остановка при сбое учёта итога — чистая
 * функция, без БД и модели.
 */
const OK: ReanalysisOneOutcome = {
    ok: true,
    usage: { tokens_count: 1, price: 0.1 },
};
const FAIL: ReanalysisOneOutcome = { ok: false, error: 'модель упала' };

const options = (
    over: Partial<ReanalysisPoolOptions> = {},
): ReanalysisPoolOptions => ({
    concurrency: 3,
    serialAfterFailures: 3,
    stopAfterFailures: 3,
    timeBudgetMs: 60_000,
    startedAt: 0,
    now: () => 0,
    ...over,
});

interface Deferred {
    promise: Promise<ReanalysisOneOutcome>;
    resolve: (outcome: ReanalysisOneOutcome) => void;
}

/** Отложенный итог: resolve снаружи, чтобы управлять порядком завершения. */
function deferred(): Deferred {
    let resolve: (outcome: ReanalysisOneOutcome) => void = () => undefined;
    const promise = new Promise<ReanalysisOneOutcome>(res => {
        resolve = res;
    });
    return { promise, resolve };
}

const flush = async (): Promise<void> => {
    for (let i = 0; i < 3; i += 1) {
        await new Promise<void>(res => setImmediate(res));
    }
};

const noop = (): Promise<void> => Promise.resolve();

describe('runReanalysisPool', () => {
    it('серия сбоев после остановки заморожена, новых звонков не берут; отставшие итоги серию не меняют', async () => {
        const items = ['a', 'b', 'c', 'd', 'e', 'f'];
        const pending = new Map(items.map(item => [item, deferred()]));
        const of = (item: string): Deferred => {
            const entry = pending.get(item);
            if (!entry) throw new Error(`нет отложенного итога ${item}`);
            return entry;
        };
        const calls: string[] = [];
        const seen: number[] = [];
        const pool = runReanalysisPool(
            items,
            item => {
                calls.push(item);
                return of(item).promise;
            },
            (_outcome, _ms, state) => {
                seen.push(state.failStreak);
                return noop();
            },
            options(),
        );
        await flush();
        expect(calls).toEqual(['a', 'b', 'c']);
        // Два сбоя: воркеры берут следующие звонки (d и e) — серия пока 2.
        of('a').resolve(FAIL);
        of('b').resolve(FAIL);
        await flush();
        expect(calls).toEqual(['a', 'b', 'c', 'd', 'e']);
        // Третий сбой — остановка; d и e уже в работе, новых не берут.
        of('c').resolve(FAIL);
        await flush();
        // Отставшие итоги после остановки: сбой серию не растит, успех не обнуляет.
        of('d').resolve(FAIL);
        of('e').resolve(OK);
        const state = await pool;

        expect(state.stopped).toBe(true);
        expect(state.failStreak).toBe(3);
        expect(state.doneInPart).toBe(1);
        expect(state.processed).toBe(5);
        expect(calls).not.toContain('f');
        expect(seen[seen.length - 1]).toBe(3);
    });

    it('после serialAfterFailures сбоев подряд новые звонки берёт один воркер', async () => {
        const outcomes: ReanalysisOneOutcome[] = [
            FAIL,
            FAIL,
            FAIL,
            OK,
            OK,
            OK,
            OK,
            OK,
        ];
        let serial = false;
        // Звонки, взятые после перехода на один воркер, не идут одновременно;
        // взятые до перехода дорабатываются как есть.
        let postSerialActive = 0;
        let postSerialOverlap = 0;
        const run = async (item: string): Promise<ReanalysisOneOutcome> => {
            const startedAfterSerial = serial;
            if (startedAfterSerial) {
                postSerialActive += 1;
                postSerialOverlap = Math.max(
                    postSerialOverlap,
                    postSerialActive,
                );
            }
            await new Promise<void>(res => setImmediate(res));
            if (startedAfterSerial) postSerialActive -= 1;
            return outcomes[Number(item)];
        };
        const state = await runReanalysisPool(
            outcomes.map((_, index) => String(index)),
            run,
            (_outcome, _ms, current) => {
                if (current.concurrency === 1) serial = true;
                return noop();
            },
            options({ stopAfterFailures: 8 }),
        );

        expect(state.concurrency).toBe(1);
        expect(state.stopped).toBe(false);
        expect(state.processed).toBe(8);
        expect(state.doneInPart).toBe(5);
        expect(postSerialOverlap).toBeLessThanOrEqual(1);
    });

    it('сбой учёта итога: остальные воркеры дорабатывают свой звонок и выходят, пул отклоняется после всех', async () => {
        const pending = ['a', 'b', 'c'].map(() => deferred());
        const calls: string[] = [];
        const run = (item: string): Promise<ReanalysisOneOutcome> => {
            calls.push(item);
            const index = ['a', 'b', 'c'].indexOf(item);
            return index === -1 ? Promise.resolve(OK) : pending[index].promise;
        };
        let callsAtRejection = -1;
        const pool = runReanalysisPool(
            ['a', 'b', 'c', 'd', 'e'],
            run,
            () => Promise.reject(new Error('запись статуса не удалась')),
            options(),
        ).catch((error: Error) => {
            callsAtRejection = calls.length;
            return error;
        });
        await flush();
        pending[0].resolve(OK);
        await flush();
        // Первый учёт упал: новых звонков не берут, b и c ещё в работе.
        expect(calls).toEqual(['a', 'b', 'c']);
        pending[1].resolve(OK);
        pending[2].resolve(FAIL);
        const error = await pool;

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('запись статуса не удалась');
        expect(callsAtRejection).toBe(3);
        expect(calls).not.toContain('d');
    });

    it('бюджет времени: следующий звонок не берётся, timeBudgetHit = true', async () => {
        let now = 0;
        const state = await runReanalysisPool(
            ['a', 'b', 'c'],
            () => {
                now = 100;
                return Promise.resolve(OK);
            },
            noop,
            options({ concurrency: 1, timeBudgetMs: 50, now: () => now }),
        );

        expect(state.processed).toBe(1);
        expect(state.timeBudgetHit).toBe(true);
    });
});

describe('runReanalysisPool: лимит в рублях (budgetHit)', () => {
    it('после исчерпания лимита новые звонки не берутся, флаг budgetHit', async () => {
        let spent = 0;
        const run = jest.fn(() => {
            spent += 0.35;
            return Promise.resolve(OK);
        });

        const state = await runReanalysisPool(
            ['a', 'b', 'c'],
            run,
            () => Promise.resolve(),
            options({ concurrency: 1, budgetHit: () => spent >= 0.5 }),
        );

        expect(run).toHaveBeenCalledTimes(2);
        expect(state).toMatchObject({
            processed: 2,
            doneInPart: 2,
            budgetHit: true,
            stopped: false,
            timeBudgetHit: false,
        });
    });

    it('без budgetHit в опциях лимит не действует', async () => {
        const state = await runReanalysisPool(
            ['a', 'b'],
            () => Promise.resolve(OK),
            () => Promise.resolve(),
            options({ concurrency: 1 }),
        );

        expect(state).toMatchObject({ processed: 2, budgetHit: false });
    });
});
