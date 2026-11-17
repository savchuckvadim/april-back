import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { JobNames } from '@lib/queue';
import { DealMovementModule } from '../deal-movement.module';
import { DealMovementScheduler } from '../deal-movement.scheduler';
import { DealMovementRunProcessor } from '../queue/deal-movement-run.processor';

const DOMAIN = 'garant.bitrix24.ru';
/** 02:27 МСК 18.11 — ночное окно счёта. */
const NIGHT = new Date('2026-11-17T23:27:00.000Z');

const buildScheduler = (input: {
    domains?: string[];
    tick?: string | null;
    lastDay?: string | null;
    enabledError?: Error;
}) => {
    const settings = {
        enabledDomains: input.enabledError
            ? jest.fn().mockRejectedValue(input.enabledError)
            : jest.fn().mockResolvedValue(input.domains ?? [DOMAIN]),
    };
    const runState = {
        lockTick: jest
            .fn()
            .mockResolvedValue(input.tick === undefined ? 'tick' : input.tick),
        unlockTick: jest.fn().mockResolvedValue(undefined),
        lastRun: jest
            .fn()
            .mockResolvedValue(
                input.lastDay ? { day: input.lastDay, at: '' } : null,
            ),
    };
    const runs = {
        run: jest.fn().mockResolvedValue({ kind: 'ran', status: {} }),
    };
    return {
        scheduler: new DealMovementScheduler(
            settings as never,
            runState as never,
            runs as never,
        ),
        runState,
        runs,
    };
};

describe('планировщик движения сделок', () => {
    it('ночью и если сегодня не считали — ночной счёт портала', async () => {
        const { scheduler, runs, runState } = buildScheduler({});

        await scheduler.tick(NIGHT);

        expect(runs.run).toHaveBeenCalledWith(
            DOMAIN,
            'count',
            'nightly',
            NIGHT,
        );
        expect(runState.unlockTick).toHaveBeenCalledWith('tick');
    });

    it('сегодня уже считали или не ночь — портал пропускается', async () => {
        const counted = buildScheduler({ lastDay: '2026-11-18' });
        await counted.scheduler.tick(NIGHT);
        expect(counted.runs.run).not.toHaveBeenCalled();

        const day = buildScheduler({});
        await day.scheduler.tick(new Date('2026-11-18T09:27:00.000Z'));
        expect(day.runs.run).not.toHaveBeenCalled();
    });

    it('нет включённых порталов или идёт прошлый тик — ничего не делаем', async () => {
        const empty = buildScheduler({ domains: [] });
        await empty.scheduler.tick(NIGHT);
        expect(empty.runState.lockTick).not.toHaveBeenCalled();

        const busy = buildScheduler({ tick: null });
        await busy.scheduler.tick(NIGHT);
        expect(busy.runs.run).not.toHaveBeenCalled();
    });

    it('настройки не прочитались — тик пропущен без исключения', async () => {
        const { scheduler, runs } = buildScheduler({
            enabledError: new Error('нет БД'),
        });
        await expect(scheduler.tick(NIGHT)).resolves.toBeUndefined();
        expect(runs.run).not.toHaveBeenCalled();
    });
});

describe('воркер прогона из админки', () => {
    const job = (dryRun: boolean) =>
        ({
            data: { domain: DOMAIN, dryRun, requestedBy: 'admin' },
            opts: { attempts: 15 },
            attemptsMade: 1,
        }) as never;

    const probes = { run: jest.fn().mockResolvedValue({ phase: 'done' }) };

    it('«Посчитать» — холостой ход, иначе внеочередной счёт', async () => {
        const runs = { run: jest.fn().mockResolvedValue({ kind: 'ran' }) };
        const processor = new DealMovementRunProcessor(
            runs as never,
            probes as never,
        );

        await processor.handle(job(true));
        await processor.handle(job(false));

        expect(runs.run).toHaveBeenNthCalledWith(1, DOMAIN, 'dry-run', 'admin');
        expect(runs.run).toHaveBeenNthCalledWith(2, DOMAIN, 'count', 'admin');
    });

    it('портал занят — джоб падает, Bull повторит; сбой счёта джоб не роняет', async () => {
        const busy = new DealMovementRunProcessor(
            {
                run: jest
                    .fn()
                    .mockResolvedValue({ kind: 'busy', domain: DOMAIN }),
            } as never,
            probes as never,
        );
        await expect(busy.handle(job(false))).rejects.toThrow('повтор');

        const failed = new DealMovementRunProcessor(
            {
                run: jest.fn().mockResolvedValue({
                    kind: 'failed',
                    domain: DOMAIN,
                    error: 'x',
                }),
            } as never,
            probes as never,
        );
        await expect(failed.handle(job(false))).resolves.toBeUndefined();
    });

    it('проверка записи в ленту — своей джобой; её сбой не тревожит как прогон', async () => {
        const processor = new DealMovementRunProcessor(
            { run: jest.fn() } as never,
            probes as never,
        );
        const data = { domain: DOMAIN, dealId: 9041, requestedBy: 'admin' };

        await processor.probe({ data } as never);
        expect(probes.run).toHaveBeenCalledWith(data);

        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        processor.onFailed(
            {
                name: JobNames.EVENT_SALES_DEAL_MOVEMENT_PROBE,
                data,
                opts: { attempts: 1 },
                attemptsMade: 1,
            } as never,
            new Error('x'),
        );
        expect(warn).not.toHaveBeenCalled();
        processor.onFailed(
            {
                name: JobNames.EVENT_SALES_DEAL_MOVEMENT_RUN,
                data: { domain: DOMAIN },
                opts: { attempts: 15 },
                attemptsMade: 15,
            } as never,
            new Error('замок'),
        );
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});

/**
 * Статическая проверка DI-графа модуля (как у аудита сделок): забытый
 * импорт виден только при старте приложения — то есть уже в проде.
 */
type Ctor = new (...args: never[]) => unknown;

const NEST_MODULE_KEYS = ['imports', 'providers', 'exports', 'controllers'];

const ctorsOf = (module: Ctor, key: string): Ctor[] =>
    ((Reflect.getMetadata(key, module) as unknown[] | undefined) ?? []).filter(
        (item): item is Ctor => typeof item === 'function',
    );

function exportsOf(module: Ctor, seen = new Set<Ctor>()): Set<Ctor> {
    const result = new Set<Ctor>();
    if (seen.has(module)) return result;
    seen.add(module);
    for (const item of ctorsOf(module, 'exports')) {
        const isModule = NEST_MODULE_KEYS.some(
            key => Reflect.getMetadata(key, item) !== undefined,
        );
        if (isModule) {
            for (const nested of exportsOf(item, seen)) result.add(nested);
            continue;
        }
        result.add(item);
    }
    return result;
}

describe('DI-граф DealMovementModule (event-sales)', () => {
    it('все зависимости провайдеров доступны в модуле, контроллеров нет', () => {
        const available = new Set<Ctor>(
            ctorsOf(DealMovementModule, 'providers'),
        );
        for (const imported of ctorsOf(DealMovementModule, 'imports')) {
            for (const exported of exportsOf(imported)) available.add(exported);
        }
        const missing: string[] = [];
        for (const target of ctorsOf(DealMovementModule, 'providers')) {
            const params =
                (Reflect.getMetadata('design:paramtypes', target) as
                    | unknown[]
                    | undefined) ?? [];
            for (const param of params) {
                if (
                    typeof param === 'function' &&
                    ![
                        Object,
                        String,
                        Number,
                        Boolean,
                        Array,
                        Function,
                    ].includes(param as never) &&
                    !available.has(param as Ctor)
                ) {
                    missing.push(`${target.name} → ${(param as Ctor).name}`);
                }
            }
        }
        expect(missing).toEqual([]);
        expect(ctorsOf(DealMovementModule, 'controllers')).toEqual([]);
    });
});
