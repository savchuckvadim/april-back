import { Logger } from '@nestjs/common';
import { DealAuditScheduler } from '../deal-audit.scheduler';
import { DealAuditRunResult } from '../types/deal-audit.types';

const ENABLED = { deal_audit_enabled: true };

const options = (dryRun = false) => ({
    dryRun,
    maxPerRun: 500,
    idleDays: 14,
    overdueHours: 24,
    stageStuckDays: 30,
    forgotCloseDays: 21,
    digest: {
        toManager: false,
        toHead: true,
        userIds: [],
        departmentUserIds: [],
        excludeUserIds: [],
        limit: 20,
    },
    intervalMinutes: 1440,
});

const runResult = (domain: string): DealAuditRunResult => ({
    domain,
    scanned: 10,
    written: 0,
    flagged: 4,
    byStatus: {},
    verdicts: [],
    dryRun: false,
    digestSent: 2,
    warnings: [],
});

const setup = (
    rows: { domain: string; settings: Record<string, unknown> }[],
) => {
    const redis = {
        set: jest.fn().mockResolvedValue('OK'),
        get: jest.fn().mockResolvedValue(null),
        del: jest.fn().mockResolvedValue(1),
    };
    const listByAppCode = jest.fn().mockResolvedValue(rows);
    const resolveOptions = jest.fn().mockResolvedValue(options());
    const runForDomain = jest
        .fn()
        .mockImplementation((domain: string) =>
            domain === 'broken.bitrix24.ru'
                ? Promise.reject(new Error('portal not found'))
                : Promise.resolve(runResult(domain)),
        );
    const scheduler = new DealAuditScheduler(
        { getClient: () => redis } as never,
        { listByAppCode } as never,
        { resolveOptions } as never,
        { runForDomain } as never,
    );
    return { scheduler, redis, listByAppCode, resolveOptions, runForDomain };
};

/** Сообщения, ушедшие в Telegram через логгер. */
const telegramMessages = (spy: jest.SpyInstance): string[] =>
    spy.mock.calls
        .filter(([, meta]) => (meta as { telegram?: boolean })?.telegram)
        .map(([message]) => String(message));

describe('DealAuditScheduler', () => {
    let log: jest.SpyInstance;
    let error: jest.SpyInstance;

    beforeEach(() => {
        log = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
        error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => jest.restoreAllMocks());

    it('прогоняет только включённые порталы и шлёт итог в Telegram', async () => {
        const { scheduler, runForDomain, redis } = setup([
            { domain: 'a.bitrix24.ru', settings: ENABLED },
            { domain: 'off.bitrix24.ru', settings: {} },
        ]);

        await scheduler.tick();

        expect(runForDomain).toHaveBeenCalledTimes(1);
        expect(runForDomain).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            expect.objectContaining({ dryRun: false }),
        );
        const [report] = telegramMessages(log);
        expect(report).toContain(
            '✅ a.bitrix24.ru: сделок 10, забытых 4, размечено 0, сводок 2',
        );
        expect(redis.del).toHaveBeenCalled();
    });

    it('ошибка портала попадает в итог и не останавливает остальные', async () => {
        const { scheduler, runForDomain, redis } = setup([
            { domain: 'broken.bitrix24.ru', settings: ENABLED },
            { domain: 'a.bitrix24.ru', settings: ENABLED },
        ]);

        await scheduler.tick();

        expect(runForDomain).toHaveBeenCalledTimes(2);
        const [report] = telegramMessages(log);
        expect(report).toContain(
            '❌ broken.bitrix24.ru: ошибка — portal not found',
        );
        expect(report).toContain('✅ a.bitrix24.ru');
        // Метка прогона ставится только успешному порталу.
        const marked = redis.set.mock.calls
            .map(([key]) => String(key))
            .filter(key => key.includes('last-run'));
        expect(marked).toEqual([expect.stringContaining('a.bitrix24.ru')]);
    });

    it('интервал не прошёл — без прогона и без Telegram', async () => {
        const { scheduler, runForDomain, redis } = setup([
            { domain: 'a.bitrix24.ru', settings: ENABLED },
        ]);
        redis.get.mockResolvedValue(String(Date.now()));

        await scheduler.tick();

        expect(runForDomain).not.toHaveBeenCalled();
        expect(telegramMessages(log)).toEqual([]);
        expect(log).toHaveBeenCalledWith(
            expect.stringContaining('все ждут своего интервала'),
        );
    });

    it('аудит нигде не включён — лок не берётся, пишет в обычный лог', async () => {
        const { scheduler, redis } = setup([
            { domain: 'off.bitrix24.ru', settings: {} },
        ]);

        await scheduler.tick();

        expect(redis.set).not.toHaveBeenCalled();
        expect(telegramMessages(log)).toEqual([]);
        expect(log).toHaveBeenCalledWith(
            'Аудит сделок не включён ни на одном портале',
        );
    });

    it('предыдущий тик ещё идёт — порталы не трогает', async () => {
        const { scheduler, redis, runForDomain } = setup([
            { domain: 'a.bitrix24.ru', settings: ENABLED },
        ]);
        redis.set.mockResolvedValueOnce(null);

        await scheduler.tick();

        expect(runForDomain).not.toHaveBeenCalled();
        expect(redis.del).not.toHaveBeenCalled();
    });

    it('БД настроек недоступна — тик пропущен, сбой не выдаётся за «нигде не включён»', async () => {
        const { scheduler, listByAppCode, redis } = setup([]);
        listByAppCode.mockRejectedValue(new Error('db down'));

        await scheduler.tick();

        expect(redis.set).not.toHaveBeenCalled();
        expect(telegramMessages(error)).toEqual([
            expect.stringContaining('db down'),
        ]);
        expect(log).not.toHaveBeenCalledWith(
            'Аудит сделок не включён ни на одном портале',
        );
    });

    it('ручной прогон: сразу, без ожидания интервала, итог в Telegram, лок снят', async () => {
        const { scheduler, runForDomain, redis } = setup([]);
        // Интервал не прошёл — крон бы ждал, ручной прогон — нет.
        redis.get.mockResolvedValue(String(Date.now()));

        const started = await scheduler.runNow('a.bitrix24.ru');
        await new Promise(resolve => setImmediate(resolve));

        expect(started).toBe(true);
        expect(runForDomain).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            expect.objectContaining({ dryRun: false }),
        );
        expect(telegramMessages(log)).toEqual([
            expect.stringContaining(
                '✅ a.bitrix24.ru: сделок 10, забытых 4, размечено 0, сводок 2',
            ),
        ]);
        const marked = redis.set.mock.calls
            .map(([key]) => String(key))
            .filter(key => key.includes('last-run'));
        expect(marked).toEqual([expect.stringContaining('a.bitrix24.ru')]);
        expect(redis.del).toHaveBeenCalled();
    });

    it('ручной прогон, пока идёт другой, не начинается', async () => {
        const { scheduler, runForDomain, redis } = setup([]);
        redis.set.mockResolvedValueOnce(null);

        const started = await scheduler.runNow('a.bitrix24.ru');
        await new Promise(resolve => setImmediate(resolve));

        expect(started).toBe(false);
        expect(runForDomain).not.toHaveBeenCalled();
        expect(redis.del).not.toHaveBeenCalled();
    });

    it('при старте шлёт в Telegram, где аудит включён и в каком режиме', async () => {
        const { scheduler, resolveOptions } = setup([
            { domain: 'a.bitrix24.ru', settings: ENABLED },
        ]);
        resolveOptions.mockResolvedValue(options(true));

        scheduler.onApplicationBootstrap();
        await new Promise(resolve => setImmediate(resolve));

        expect(telegramMessages(log)).toEqual([
            '🧹 Аудит сделок включён на порталах: 1\n' +
                '• a.bitrix24.ru — только считать — ничего не пишет и не рассылает, раз в 24 ч',
        ]);
    });
});
