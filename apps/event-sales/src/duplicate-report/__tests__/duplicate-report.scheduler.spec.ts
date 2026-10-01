import { Logger } from '@nestjs/common';
import { DuplicateReportScheduler } from '../duplicate-report.scheduler';
import { DuplicateReportRunState } from '../services/duplicate-report-run-state';
import {
    DuplicateReportOptions,
    DuplicateReportRunResult,
} from '../types/duplicate-report.types';

const ENABLED = { duplicate_report_enabled: true };
/** Понедельник 05.10.2026 10:00 по Москве — неделя «2026-10-05». */
const MONDAY_10 = new Date('2026-10-05T10:00:00+03:00');
const WEEK = '2026-10-05';
const LOCK_KEY = 'event-sales:duplicate-report-lock';
const weekKey = (domain: string, countOnly = false) =>
    `event-sales:duplicate-report:last-week${countOnly ? '-count' : ''}:${domain}`;
const failKey = (domain: string) =>
    `event-sales:duplicate-report:failed:${domain}`;

const options = (countOnly = false): DuplicateReportOptions => ({
    countOnly,
    schedule: { weekday: 1, hour: 9 },
    recipients: { toHead: true, departmentUserIds: [], structureUserIds: [] },
    excludeUserIds: [],
    deadlineDays: 3,
});

const runResult = (
    domain: string,
    countOnly = false,
    patch: Partial<DuplicateReportRunResult> = {},
): DuplicateReportRunResult => ({
    domain,
    countOnly,
    scanned: 40,
    clients: 5,
    deals: 11,
    decide: 1,
    join: 4,
    newThisWeek: 2,
    recipients: 2,
    tasksCreated: countOnly ? 0 : 2,
    tasksClosed: 0,
    warnings: [],
    ...patch,
});

const setup = (
    rows: { domain: string; settings: Record<string, unknown> }[],
    countOnlySetting = false,
) => {
    /** Ключи Redis, кроме лока: метки недели и счётчик сбоев. */
    const store = new Map<string, string>();
    const redis = {
        set: jest.fn((key: string, value: string) => {
            if (key !== LOCK_KEY) store.set(key, value);
            return Promise.resolve('OK');
        }),
        get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
        del: jest.fn((key: string) => {
            store.delete(key);
            return Promise.resolve(1);
        }),
        eval: jest.fn().mockResolvedValue(1),
    };
    const listByAppCode = jest.fn().mockResolvedValue(rows);
    const resolveOptions = jest
        .fn()
        .mockImplementation(
            (_domain: string, overrides: { countOnly?: boolean } = {}) =>
                Promise.resolve(
                    options(overrides.countOnly ?? countOnlySetting),
                ),
        );
    const runForDomain = jest
        .fn()
        .mockImplementation((domain: string, opts: DuplicateReportOptions) =>
            domain === 'broken.bitrix24.ru'
                ? Promise.reject(new Error('portal not found'))
                : Promise.resolve(runResult(domain, opts.countOnly)),
        );
    const scheduler = new DuplicateReportScheduler(
        new DuplicateReportRunState({ getClient: () => redis } as never),
        { listByAppCode } as never,
        { resolveOptions } as never,
        { runForDomain } as never,
    );
    return {
        scheduler,
        redis,
        store,
        listByAppCode,
        resolveOptions,
        runForDomain,
    };
};

/** Сообщения, ушедшие в Telegram через логгер. */
const telegramMessages = (spy: jest.SpyInstance): string[] =>
    spy.mock.calls
        .filter(([, meta]) => (meta as { telegram?: boolean })?.telegram)
        .map(([message]) => String(message));

/** Метки недель, которые поставил прогон. */
const weekMarks = (redis: { set: jest.Mock }): string[] =>
    redis.set.mock.calls
        .filter(([key]) => String(key).includes('last-week'))
        .map(([key, value]) => `${String(key)}=${String(value)}`);

/** Лок снят своим токеном (compare-and-delete), а не слепым DEL. */
const released = (redis: { eval: jest.Mock }): boolean =>
    redis.eval.mock.calls.some(
        ([script, , key]) =>
            String(script).includes("'del'") && key === LOCK_KEY,
    );

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('DuplicateReportScheduler', () => {
    let log: jest.SpyInstance;
    let error: jest.SpyInstance;

    beforeEach(() => {
        jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
        jest.setSystemTime(MONDAY_10);
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

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('в день и час отчёта прогоняет включённые порталы, закрывает неделю и шлёт итог', async () => {
        const { scheduler, runForDomain, redis } = setup([
            { domain: 'a.bitrix24.ru', settings: ENABLED },
            { domain: 'off.bitrix24.ru', settings: {} },
        ]);

        await scheduler.tick();

        expect(runForDomain).toHaveBeenCalledTimes(1);
        expect(runForDomain).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            expect.objectContaining({ countOnly: false }),
            MONDAY_10,
            { previewUserId: undefined },
        );
        expect(weekMarks(redis)).toEqual([
            `${weekKey('a.bitrix24.ru')}=${WEEK}`,
        ]);
        const [report] = telegramMessages(log);
        expect(report).toContain('✅ a.bitrix24.ru: клиентов 5, сделок 11');
        expect(released(redis)).toBe(true);
    });

    it('перед каждым порталом лок продлевается — долгий тик не теряет его', async () => {
        const { scheduler, redis } = setup([
            { domain: 'a.bitrix24.ru', settings: ENABLED },
            { domain: 'b.bitrix24.ru', settings: ENABLED },
        ]);

        await scheduler.tick();

        const extends_ = redis.eval.mock.calls.filter(([script]) =>
            String(script).includes("'expire'"),
        );
        expect(extends_).toHaveLength(2);
    });

    it('до дня и часа отчёта — без прогона и без Telegram', async () => {
        jest.setSystemTime(new Date('2026-10-05T08:30:00+03:00'));
        const { scheduler, runForDomain } = setup([
            { domain: 'a.bitrix24.ru', settings: ENABLED },
        ]);

        await scheduler.tick();

        expect(runForDomain).not.toHaveBeenCalled();
        expect(telegramMessages(log)).toEqual([]);
    });

    it('отчёт этой недели уже ушёл — повторно не прогоняет', async () => {
        const { scheduler, runForDomain, store } = setup([
            { domain: 'a.bitrix24.ru', settings: ENABLED },
        ]);
        store.set(weekKey('a.bitrix24.ru'), WEEK);

        await scheduler.tick();

        expect(runForDomain).not.toHaveBeenCalled();
    });

    it('метка прошлой недели не мешает: в среду отчёт догоняет пропущенный понедельник', async () => {
        jest.setSystemTime(new Date('2026-10-07T12:00:00+03:00'));
        const { scheduler, runForDomain, store } = setup([
            { domain: 'a.bitrix24.ru', settings: ENABLED },
        ]);
        store.set(weekKey('a.bitrix24.ru'), '2026-09-28');

        await scheduler.tick();

        expect(runForDomain).toHaveBeenCalledTimes(1);
    });

    it('«только считать» закрывает только свою неделю: выключили в ту же неделю — задачи уйдут сразу', async () => {
        const counted = setup(
            [{ domain: 'a.bitrix24.ru', settings: ENABLED }],
            true,
        );
        await counted.scheduler.tick();
        expect(weekMarks(counted.redis)).toEqual([
            `${weekKey('a.bitrix24.ru', true)}=${WEEK}`,
        ]);

        const real = setup([{ domain: 'a.bitrix24.ru', settings: ENABLED }]);
        real.store.set(weekKey('a.bitrix24.ru', true), WEEK);
        await real.scheduler.tick();
        expect(real.runForDomain).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            expect.objectContaining({ countOnly: false }),
            MONDAY_10,
            { previewUserId: undefined },
        );
    });

    it('ни одной задачи из N не поставлено — неделя не закрыта, прогон повторится', async () => {
        const { scheduler, runForDomain, redis } = setup([
            { domain: 'a.bitrix24.ru', settings: ENABLED },
        ]);
        runForDomain.mockResolvedValue(
            runResult('a.bitrix24.ru', false, {
                tasksCreated: 0,
                warnings: ['задача-отчёт сотруднику 11 не создана: 503'],
            }),
        );

        await scheduler.tick();

        expect(weekMarks(redis)).toEqual([]);
        const [report] = telegramMessages(log);
        expect(report).toContain('задачи не поставлены ни одному из 2');
        expect(report).toContain('повторю в следующий час');
    });

    it('ошибка портала попадает в итог и не останавливает остальные; метка — только успешному', async () => {
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
        expect(weekMarks(redis)).toEqual([
            expect.stringContaining('a.bitrix24.ru'),
        ]);
    });

    it('повторный сбой той же недели — молча, без Telegram', async () => {
        const { scheduler, store } = setup([
            { domain: 'broken.bitrix24.ru', settings: ENABLED },
        ]);
        store.set(failKey('broken.bitrix24.ru'), `${WEEK}:1`);

        await scheduler.tick();

        expect(telegramMessages(log)).toEqual([]);
        expect(store.get(failKey('broken.bitrix24.ru'))).toBe(`${WEEK}:2`);
    });

    it('последняя попытка недели — в Telegram, и неделя закрывается', async () => {
        const { scheduler, store, redis } = setup([
            { domain: 'broken.bitrix24.ru', settings: ENABLED },
        ]);
        store.set(failKey('broken.bitrix24.ru'), `${WEEK}:4`);

        await scheduler.tick();

        const [report] = telegramMessages(log);
        expect(report).toContain('отчёт этой недели пропущен');
        expect(weekMarks(redis)).toEqual([
            `${weekKey('broken.bitrix24.ru')}=${WEEK}`,
        ]);
        expect(store.has(failKey('broken.bitrix24.ru'))).toBe(false);
    });

    it('отчёт нигде не включён — лок не берётся', async () => {
        const { scheduler, redis } = setup([
            { domain: 'off.bitrix24.ru', settings: {} },
        ]);

        await scheduler.tick();

        expect(redis.set).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(
            'Отчёт по дублям не включён ни на одном портале',
        );
    });

    it('прошлый прогон ещё идёт — порталы не трогает и чужой лок не снимает', async () => {
        const { scheduler, redis, runForDomain } = setup([
            { domain: 'a.bitrix24.ru', settings: ENABLED },
        ]);
        redis.set.mockResolvedValueOnce(null as never);

        await scheduler.tick();

        expect(runForDomain).not.toHaveBeenCalled();
        expect(redis.eval).not.toHaveBeenCalled();
    });

    it('БД настроек недоступна — тик пропущен, ошибка в Telegram', async () => {
        const { scheduler, listByAppCode, redis } = setup([]);
        listByAppCode.mockRejectedValue(new Error('db down'));

        await scheduler.tick();

        expect(redis.set).not.toHaveBeenCalled();
        expect(telegramMessages(error)).toEqual([
            expect.stringContaining('db down'),
        ]);
    });

    it('ручной прогон «только посчитать»: сразу, вне расписания, неделю не закрывает', async () => {
        jest.setSystemTime(new Date('2026-10-03T12:00:00+03:00'));
        const { scheduler, runForDomain, redis, resolveOptions } = setup([]);

        const started = await scheduler.runNow('a.bitrix24.ru', true);
        await flush();

        expect(started).toBe(true);
        expect(resolveOptions).toHaveBeenCalledWith('a.bitrix24.ru', {
            countOnly: true,
        });
        expect(runForDomain).toHaveBeenCalledTimes(1);
        expect(weekMarks(redis)).toEqual([]);
        expect(telegramMessages(log)).toEqual([
            expect.stringContaining('⏸ a.bitrix24.ru'),
        ]);
        expect(released(redis)).toBe(true);
    });

    it('ручной прогон с задачами закрывает неделю — крон не повторит его следом', async () => {
        const { scheduler, redis } = setup([]);

        await scheduler.runNow('a.bitrix24.ru', false);
        await flush();

        expect(weekMarks(redis)).toEqual([
            `${weekKey('a.bitrix24.ru')}=${WEEK}`,
        ]);
    });

    it('проба одному сотруднику: задача уходит, неделя не закрывается', async () => {
        const { scheduler, redis, runForDomain } = setup([]);

        await scheduler.runNow('a.bitrix24.ru', undefined, 7);
        await flush();

        expect(runForDomain).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            expect.any(Object),
            expect.any(Date),
            { previewUserId: 7 },
        );
        expect(weekMarks(redis)).toEqual([]);
    });

    it('ручной прогон, пока идёт другой, не начинается', async () => {
        const { scheduler, runForDomain, redis } = setup([]);
        redis.set.mockResolvedValueOnce(null as never);

        const started = await scheduler.runNow('a.bitrix24.ru');
        await flush();

        expect(started).toBe(false);
        expect(runForDomain).not.toHaveBeenCalled();
        expect(redis.eval).not.toHaveBeenCalled();
    });
});
