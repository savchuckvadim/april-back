import { TimedCache } from '../timed-cache.util';

const makeClock = (start = 1_000) => {
    let now = start;
    return {
        now: () => now,
        advance: (ms: number) => {
            now += ms;
        },
    };
};

describe('TimedCache', () => {
    it('в пределах срока жизни значение берётся из памяти', async () => {
        const clock = makeClock();
        const cache = new TimedCache<string>(60_000, clock.now);
        const load = jest.fn().mockResolvedValue('portal');

        expect(await cache.get('a', load)).toBe('portal');
        clock.advance(59_999);
        expect(await cache.get('a', load)).toBe('portal');

        expect(load).toHaveBeenCalledTimes(1);
    });

    it('срок истёк — значение загружается заново', async () => {
        const clock = makeClock();
        const cache = new TimedCache<string>(60_000, clock.now);
        const load = jest
            .fn()
            .mockResolvedValueOnce('v1')
            .mockResolvedValueOnce('v2');

        await cache.get('a', load);
        clock.advance(60_000);

        expect(await cache.get('a', load)).toBe('v2');
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('параллельные запросы одного ключа ждут одну загрузку', async () => {
        const cache = new TimedCache<string>(60_000);
        let release: (value: string) => void = () => undefined;
        const load = jest.fn(
            () =>
                new Promise<string>(resolve => {
                    release = resolve;
                }),
        );

        const first = cache.get('a', load);
        const second = cache.get('a', load);
        release('portal');

        expect(await Promise.all([first, second])).toEqual([
            'portal',
            'portal',
        ]);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('у каждого ключа своя запись', async () => {
        const cache = new TimedCache<string>(60_000);

        expect(await cache.get('a', () => Promise.resolve('A'))).toBe('A');
        expect(await cache.get('b', () => Promise.resolve('B'))).toBe('B');
        expect(await cache.get('a', () => Promise.resolve('другое'))).toBe('A');
    });

    it('«не получилось» (undefined) не запоминается', async () => {
        const cache = new TimedCache<string>(60_000);
        const load = jest
            .fn()
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce('portal');

        expect(await cache.get('a', load)).toBeUndefined();
        expect(await cache.get('a', load)).toBe('portal');
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('ошибка загрузки доходит до вызывающего и не запоминается', async () => {
        const cache = new TimedCache<string>(60_000);
        const load = jest
            .fn()
            .mockRejectedValueOnce(new Error('база недоступна'))
            .mockResolvedValueOnce('portal');

        await expect(cache.get('a', load)).rejects.toThrow('база недоступна');
        expect(await cache.get('a', load)).toBe('portal');
    });

    it('сброс записи заставляет загрузить заново', async () => {
        const cache = new TimedCache<string>(60_000);
        const load = jest
            .fn()
            .mockResolvedValueOnce('v1')
            .mockResolvedValueOnce('v2');

        await cache.get('a', load);
        cache.delete('a');

        expect(await cache.get('a', load)).toBe('v2');
    });

    it('нулевой срок жизни выключает кэш', async () => {
        const cache = new TimedCache<string>(0);
        const load = jest.fn().mockResolvedValue('portal');

        await cache.get('a', load);
        await cache.get('a', load);

        expect(load).toHaveBeenCalledTimes(2);
    });
});

describe('TimedCache: потолок записей', () => {
    it('сверх потолка выбрасываются самые старые записи', async () => {
        const clock = makeClock();
        const cache = new TimedCache<string>(60_000, clock.now, 2);

        await cache.get('a', () => Promise.resolve('A'));
        clock.advance(1);
        await cache.get('b', () => Promise.resolve('B'));
        clock.advance(1);
        await cache.get('c', () => Promise.resolve('C'));

        expect(cache.size).toBe(2);
        const reload = jest.fn().mockResolvedValue('A2');
        expect(await cache.get('a', reload)).toBe('A2');
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('сначала выбрасываются истёкшие, свежие остаются', async () => {
        const clock = makeClock();
        const cache = new TimedCache<string>(1_000, clock.now, 2);

        await cache.get('old', () => Promise.resolve('O'));
        clock.advance(5_000);
        await cache.get('b', () => Promise.resolve('B'));
        await cache.get('c', () => Promise.resolve('C'));

        expect(cache.size).toBe(2);
        const keep = jest.fn();
        expect(await cache.get('b', keep)).toBe('B');
        expect(keep).not.toHaveBeenCalled();
    });

    it('срок жизни 0 — записи не копятся, одновременные склеиваются', async () => {
        const cache = new TimedCache<string>(0);
        let resolve: (value: string) => void = () => undefined;
        const load = jest.fn(
            () => new Promise<string>(done => (resolve = done)),
        );

        const first = cache.get('a', load);
        const second = cache.get('a', load);
        resolve('v');

        expect(await first).toBe('v');
        expect(await second).toBe('v');
        expect(load).toHaveBeenCalledTimes(1);
        expect(cache.size).toBe(0);
    });
});
