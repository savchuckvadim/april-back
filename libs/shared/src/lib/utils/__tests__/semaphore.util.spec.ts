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
