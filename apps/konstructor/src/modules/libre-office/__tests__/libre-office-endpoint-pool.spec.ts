import { LibreOfficeConfig } from '../config/libre-office.config';
import { LibreOfficeBusyError } from '../errors/libre-office.errors';
import { LibreOfficeEndpointPool } from '../services/libre-office-endpoint-pool.service';
import {
    deferred,
    libreOfficeConfig,
    sleep,
    stubResolver,
} from './libre-office.fixtures';

function buildPool(
    overrides: Partial<LibreOfficeConfig> = {},
    resolve: () => Promise<string[]> = () => Promise.resolve([]),
): LibreOfficeEndpointPool {
    return new LibreOfficeEndpointPool(
        libreOfficeConfig(overrides),
        stubResolver(resolve),
    );
}

describe('LibreOfficeEndpointPool', () => {
    it('capacity = число инстансов * слотов на инстанс', () => {
        expect(buildPool({ slotsPerEndpoint: 2 }).capacity).toBe(4);
    });

    it('распределяет задачи по наименее загруженным инстансам', async () => {
        const pool = buildPool();
        const used: string[] = [];
        const first = deferred();
        const second = deferred();

        const jobs = [
            pool.run(async url => {
                used.push(url);
                await first.promise;
            }),
            pool.run(async url => {
                used.push(url);
                await second.promise;
            }),
        ];
        await sleep(0);

        expect(new Set(used).size).toBe(2);

        first.resolve();
        second.resolve();
        await Promise.all(jobs);
    });

    it('не запускает больше capacity задач одновременно', async () => {
        const pool = buildPool();
        let active = 0;
        let maxActive = 0;

        await Promise.all(
            Array.from({ length: 6 }, () =>
                pool.run(async () => {
                    active++;
                    maxActive = Math.max(maxActive, active);
                    await sleep(5);
                    active--;
                }),
            ),
        );

        expect(maxActive).toBe(2);
    });

    it('отдаёт Busy, когда очередь ожидания переполнена', async () => {
        const pool = buildPool({
            endpoints: ['http://a:3000'],
            maxQueue: 1,
        });
        const blocker = deferred();

        const running = pool.run(() => blocker.promise);
        const queued = pool.run(() => Promise.resolve());

        await expect(pool.run(() => Promise.resolve())).rejects.toBeInstanceOf(
            LibreOfficeBusyError,
        );

        blocker.resolve();
        await Promise.all([running, queued]);
    });

    it('ретрай уходит на другой инстанс, а не на упавший', async () => {
        const pool = buildPool();

        const firstUrl = await pool.run(url => Promise.resolve(url));
        const secondUrl = await pool.run(url => Promise.resolve(url), firstUrl);

        expect(secondUrl).not.toBe(firstUrl);
    });

    it('при единственном инстансе ретрай всё равно возможен', async () => {
        const pool = buildPool({ endpoints: ['http://only:3000'] });

        await expect(
            pool.run(url => Promise.resolve(url), 'http://only:3000'),
        ).resolves.toBe('http://only:3000');
    });

    it('слот освобождается после исключения в задаче', async () => {
        const pool = buildPool({ endpoints: ['http://a:3000'] });

        await expect(
            pool.run(() => Promise.reject(new Error('boom'))),
        ).rejects.toThrow('boom');
        expect(pool.stats()).toEqual({
            endpoints: 1,
            capacity: 1,
            active: 0,
            pending: 0,
            cooling: 0,
        });
    });

    describe('cooldown подбитых инстансов', () => {
        it('после penalize задачи идут на другой инстанс', async () => {
            const pool = buildPool();

            pool.penalize('http://a:3000');

            await expect(pool.run(url => Promise.resolve(url))).resolves.toBe(
                'http://b:3000',
            );
            expect(pool.stats().cooling).toBe(1);
        });

        it('если все инстансы в cooldown — работаем всё равно', async () => {
            const pool = buildPool();

            pool.penalize('http://a:3000');
            pool.penalize('http://b:3000');

            await expect(
                pool.run(url => Promise.resolve(url)),
            ).resolves.toMatch(/^http:\/\/[ab]:3000$/);
        });

        it('с нулевым cooldown никого не наказываем', () => {
            const pool = buildPool({ failureCooldownMs: 0 });

            pool.penalize('http://a:3000');

            expect(pool.stats().cooling).toBe(0);
        });
    });

    describe('discovery=dns', () => {
        const dns = (endpoints: string[]) => (): Promise<string[]> =>
            Promise.resolve(endpoints);

        it('подхватывает реплики вместо стартового имени сервиса', async () => {
            const pool = buildPool(
                { discovery: 'dns', endpoints: ['http://gotenberg:3000'] },
                dns(['http://10.0.0.1:3000', 'http://10.0.0.2:3000']),
            );

            await pool.run(() => Promise.resolve());

            expect(pool.stats().endpoints).toBe(2);
            expect(pool.capacity).toBe(2);
        });

        it('не резолвит чаще, чем раз в TTL, и не дублирует запросы', async () => {
            let calls = 0;
            const pool = buildPool(
                {
                    discovery: 'dns',
                    endpoints: ['http://gotenberg:3000'],
                    discoveryTtlMs: 30_000,
                },
                () => {
                    calls++;
                    return Promise.resolve(['http://10.0.0.1:3000']);
                },
            );

            await Promise.all([
                pool.run(() => Promise.resolve()),
                pool.run(() => Promise.resolve()),
            ]);
            await pool.run(() => Promise.resolve());

            expect(calls).toBe(1);
        });

        it('исчезнувший инстанс удаляется только когда освободится', async () => {
            let discovered = ['http://10.0.0.1:3000'];
            const pool = buildPool(
                {
                    discovery: 'dns',
                    endpoints: ['http://10.0.0.1:3000'],
                    discoveryTtlMs: 1,
                },
                () => Promise.resolve(discovered),
            );
            const blocker = deferred();

            const busy = pool.run(() => blocker.promise);
            await sleep(5);

            // Реплику погасили, но она занята — из пула не выкидываем.
            discovered = ['http://10.0.0.2:3000'];
            await pool.run(() => Promise.resolve());
            expect(pool.stats().endpoints).toBe(2);

            blocker.resolve();
            await busy;
            await sleep(5);
            await pool.run(() => Promise.resolve());

            expect(pool.stats().endpoints).toBe(1);
        });

        it('при ошибке резолвера оставляет прежний состав', async () => {
            const pool = buildPool(
                {
                    discovery: 'dns',
                    endpoints: ['http://gotenberg:3000'],
                    discoveryTtlMs: 1,
                },
                () => Promise.reject(new Error('DNS недоступен')),
            );

            await expect(pool.run(url => Promise.resolve(url))).resolves.toBe(
                'http://gotenberg:3000',
            );
            expect(pool.stats().endpoints).toBe(1);
        });

        it('пустой ответ резолвера не обнуляет пул', async () => {
            const pool = buildPool(
                {
                    discovery: 'dns',
                    endpoints: ['http://gotenberg:3000'],
                    discoveryTtlMs: 1,
                },
                dns([]),
            );

            await pool.run(() => Promise.resolve());

            expect(pool.stats().endpoints).toBe(1);
        });
    });
});
