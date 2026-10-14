import { INestApplication, LoggerService } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
    applyStandbyMode,
    collectBullQueues,
    formatStandbyReport,
    PausableQueue,
    pauseQueues,
    stopSchedule,
} from '../standby-mode';

const makeQueue = (name: string): PausableQueue & { pause: jest.Mock } => ({
    name,
    pause: jest.fn().mockResolvedValue(undefined),
});

/** Контейнер модулей: имя модуля → провайдеры (токен → { instance }). */
const makeContainer = (
    modules: Record<string, Map<unknown, { instance: unknown }>>,
): ModulesContainer =>
    new Map(
        Object.entries(modules).map(([name, providers]) => [
            name,
            { providers },
        ]),
    ) as unknown as ModulesContainer;

const makeRegistry = (opts: {
    cronJobs?: Map<string, { stop: jest.Mock }>;
    intervals?: string[];
    timeouts?: string[];
}) => {
    const registry = {
        getCronJobs: jest.fn(() => opts.cronJobs ?? new Map()),
        getIntervals: jest.fn(() => [...(opts.intervals ?? [])]),
        deleteInterval: jest.fn(),
        getTimeouts: jest.fn(() => [...(opts.timeouts ?? [])]),
        deleteTimeout: jest.fn(),
    };
    return registry as unknown as SchedulerRegistry & typeof registry;
};

describe('stopSchedule', () => {
    it('без реестра ничего не останавливает и отдаёт пустой отчёт', async () => {
        await expect(stopSchedule(undefined)).resolves.toEqual({
            cronJobs: [],
            intervals: [],
            timeouts: [],
        });
    });

    it('останавливает каждый крон и снимает интервалы и таймауты', async () => {
        const audit = { stop: jest.fn().mockResolvedValue(undefined) };
        const digest = { stop: jest.fn().mockReturnValue(undefined) };
        const registry = makeRegistry({
            cronJobs: new Map([
                ['deal-audit', audit],
                ['weekly-digest', digest],
            ]),
            intervals: ['poll-im'],
            timeouts: ['warmup'],
        });

        const report = await stopSchedule(registry);

        expect(audit.stop).toHaveBeenCalledTimes(1);
        expect(digest.stop).toHaveBeenCalledTimes(1);
        expect(registry.deleteInterval).toHaveBeenCalledWith('poll-im');
        expect(registry.deleteTimeout).toHaveBeenCalledWith('warmup');
        expect(report).toEqual({
            cronJobs: ['deal-audit', 'weekly-digest'],
            intervals: ['poll-im'],
            timeouts: ['warmup'],
        });
    });
});

describe('collectBullQueues', () => {
    it('берёт только провайдеры с токеном BullQueue_ и инстансом с pause, без дублей', () => {
        const calls = makeQueue('calls');
        const reports = makeQueue('reports');
        const container = makeContainer({
            EventModule: new Map<unknown, { instance: unknown }>([
                ['BullQueue_calls', { instance: calls }],
                [class Service {}, { instance: { pause: jest.fn() } }],
                ['BullQueue_broken', { instance: { name: 'broken' } }],
            ]),
            ReportModule: new Map<unknown, { instance: unknown }>([
                ['BullQueue_calls', { instance: calls }],
                ['BullQueue_reports', { instance: reports }],
                ['SOME_CONFIG', { instance: 'string' }],
            ]),
        });

        expect(collectBullQueues(container)).toEqual([calls, reports]);
    });

    it('пустой контейнер — пустой список', () => {
        expect(collectBullQueues(makeContainer({}))).toEqual([]);
    });
});

describe('pauseQueues', () => {
    it('ставит локальную паузу без ожидания активных задач и отдаёт имена', async () => {
        const calls = makeQueue('calls');
        const reports = makeQueue('reports');

        await expect(pauseQueues([calls, reports])).resolves.toEqual([
            'calls',
            'reports',
        ]);
        expect(calls.pause).toHaveBeenCalledWith(true, true);
        expect(reports.pause).toHaveBeenCalledWith(true, true);
    });
});

describe('formatStandbyReport', () => {
    it('перечисляет остановленное, пустые группы помечает «нет»', () => {
        const text = formatStandbyReport({
            cronJobs: ['deal-audit'],
            intervals: [],
            timeouts: [],
            queues: ['calls', 'reports'],
        });

        expect(text).toContain('APP_ROLE=standby');
        expect(text).toContain('кроны остановлены: 1 (deal-audit)');
        expect(text).toContain('интервалы сняты: нет');
        expect(text).toContain('воркеры очередей на паузе: 2 (calls, reports)');
    });
});

describe('applyStandbyMode', () => {
    const makeApp = (providers: Map<unknown, unknown>): INestApplication =>
        ({
            get: jest.fn((token: unknown) => {
                if (!providers.has(token)) {
                    throw new Error('provider not found');
                }
                return providers.get(token);
            }),
        }) as unknown as INestApplication;

    const makeLogger = (): LoggerService & { warn: jest.Mock } =>
        ({
            warn: jest.fn(),
            log: jest.fn(),
            error: jest.fn(),
        }) as unknown as LoggerService & { warn: jest.Mock };

    it('останавливает кроны и очереди и предупреждает в лог с пометкой для Telegram', async () => {
        const job = { stop: jest.fn().mockResolvedValue(undefined) };
        const registry = makeRegistry({ cronJobs: new Map([['sync', job]]) });
        const queue = makeQueue('calls');
        const container = makeContainer({
            M: new Map<unknown, { instance: unknown }>([
                ['BullQueue_calls', { instance: queue }],
            ]),
        });
        const app = makeApp(
            new Map<unknown, unknown>([
                [SchedulerRegistry, registry],
                [ModulesContainer, container],
            ]),
        );
        const logger = makeLogger();

        const report = await applyStandbyMode(app, logger);

        expect(report).toEqual({
            cronJobs: ['sync'],
            intervals: [],
            timeouts: [],
            queues: ['calls'],
        });
        expect(job.stop).toHaveBeenCalled();
        expect(queue.pause).toHaveBeenCalledWith(true, true);
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('APP_ROLE=standby'),
            { telegram: true },
        );
    });

    it('приложение без ScheduleModule: реестра нет, очереди всё равно на паузе', async () => {
        const queue = makeQueue('provision');
        const container = makeContainer({
            M: new Map<unknown, { instance: unknown }>([
                ['BullQueue_provision', { instance: queue }],
            ]),
        });
        const app = makeApp(
            new Map<unknown, unknown>([[ModulesContainer, container]]),
        );

        const report = await applyStandbyMode(app, makeLogger());

        expect(report.cronJobs).toEqual([]);
        expect(report.queues).toEqual(['provision']);
        expect(queue.pause).toHaveBeenCalledWith(true, true);
    });

    it('приложение без очередей и кронов: пустой отчёт, без ошибок', async () => {
        const app = makeApp(new Map());

        await expect(applyStandbyMode(app, makeLogger())).resolves.toEqual({
            cronJobs: [],
            intervals: [],
            timeouts: [],
            queues: [],
        });
    });
});
