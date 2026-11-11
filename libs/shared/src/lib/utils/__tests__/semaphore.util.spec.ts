import { Semaphore, parseConcurrency } from '../semaphore.util';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));

describe('Semaphore', () => {
    it('не пускает больше limit задач одновременно', async () => {
        const semaphore = new Semaphore(2);
        let running = 0;
        let maxRunning = 0;
        const resolvers: (() => void)[] = [];

        const task = () =>
            semaphore.run(async () => {
                running++;
                maxRunning = Math.max(maxRunning, running);
                await new Promise<void>(resolve => resolvers.push(resolve));
                running--;
            });

        const all = Promise.all([task(), task(), task(), task()]);
        await tick();
        expect(running).toBe(2);
        expect(semaphore.pendingCount).toBe(2);

        resolvers.shift()?.();
        await tick();
        expect(running).toBe(2);

        while (resolvers.length) resolvers.shift()?.();
        await tick();
        while (resolvers.length) resolvers.shift()?.();
        await all;
        expect(maxRunning).toBe(2);
        expect(semaphore.activeCount).toBe(0);
    });

    it('освобождает слот при исключении задачи', async () => {
        const semaphore = new Semaphore(1);
        await expect(
            semaphore.run(() => Promise.reject(new Error('boom'))),
        ).rejects.toThrow('boom');
        // Слот свободен — следующая задача выполняется.
        const result = await semaphore.run(() => Promise.resolve('ok'));
        expect(result).toBe('ok');
        expect(semaphore.activeCount).toBe(0);
    });

    it('лимит < 1 — ошибка конструктора', () => {
        expect(() => new Semaphore(0)).toThrow();
    });
});

/** Смена предела на ходу — настройка из админки без перезапуска (11.11.2026). */
describe('Semaphore.setLimit', () => {
    const flush = () => new Promise<void>(done => setImmediate(done));

    /** Задача, которая держит слот, пока тест её не отпустит. */
    const holdSlot = (semaphore: Semaphore) => {
        let release: () => void = () => undefined;
        const done = semaphore.run(
            () =>
                new Promise<void>(resolve => {
                    release = resolve;
                }),
        );
        return { done, release: () => release() };
    };

    it('предел подняли — ждущие сразу получают слоты', async () => {
        const semaphore = new Semaphore(1);
        const first = holdSlot(semaphore);
        const second = holdSlot(semaphore);
        await flush();
        expect(semaphore.activeCount).toBe(1);
        expect(semaphore.pendingCount).toBe(1);

        semaphore.setLimit(2);
        expect(semaphore.maxConcurrent).toBe(2);
        expect(semaphore.activeCount).toBe(2);
        expect(semaphore.pendingCount).toBe(0);

        // Задача второго стартует микрозадачей после выдачи слота.
        await flush();
        first.release();
        second.release();
        await Promise.all([first.done, second.done]);
    });

    it('предел опустили — идущие доделываются, новые ждут, пока занятых не станет меньше предела', async () => {
        const semaphore = new Semaphore(2);
        const first = holdSlot(semaphore);
        const second = holdSlot(semaphore);
        await flush();

        semaphore.setLimit(1);
        const third = holdSlot(semaphore);
        await flush();
        expect(semaphore.activeCount).toBe(2);
        expect(semaphore.pendingCount).toBe(1);

        // Освободился один — занят ещё один, при пределе 1 третий ждёт.
        first.release();
        await first.done;
        expect(semaphore.activeCount).toBe(1);
        expect(semaphore.pendingCount).toBe(1);

        second.release();
        await second.done;
        expect(semaphore.activeCount).toBe(1);
        expect(semaphore.pendingCount).toBe(0);

        await flush();
        third.release();
        await third.done;
        expect(semaphore.activeCount).toBe(0);
    });

    it('предел < 1 — ошибка, прежний предел остаётся', () => {
        const semaphore = new Semaphore(3);
        expect(() => semaphore.setLimit(0)).toThrow();
        expect(semaphore.maxConcurrent).toBe(3);
    });
});

describe('parseConcurrency', () => {
    it.each([
        ['3', 3],
        ['1', 1],
        [undefined, 5],
        ['0', 5],
        ['-2', 5],
        ['abc', 5],
        ['', 5],
    ])('parseConcurrency(%p) → %p (default 5)', (raw, expected) => {
        expect(parseConcurrency(raw, 5)).toBe(expected);
    });
});
