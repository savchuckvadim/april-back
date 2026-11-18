import { Logger } from '@nestjs/common';
import {
    EnumPortalAppCode,
    getPortalAppDefaults,
} from '@lib/portal-lib/store/app-settings';
import {
    RopPeriodRunner,
    RopReportTicker,
    type RopRunSummary,
} from '@lib/rop-reports';
import { ETimeZone } from '@lib/shared/lib/date';
import { isWorkdayOf } from '../adapters/period-digest-calendar.adapter';
import {
    PERIOD_DIGEST_CRON_NAME,
    PERIOD_DIGEST_DELIVERY_PENDING_LINE,
} from '../constants/period-digest.const';
import { periodDigestOptionsOf } from '../lib/period-digest-options';
import { PeriodDigestDefinition } from '../period-digest.definition';
import { PeriodDigestScheduler } from '../period-digest.scheduler';
import { fallbackWorkingHours } from '../../shared/working-hours/working-hours.model';

const DOMAIN = 'garant.bitrix24.ru';

/** Вторник 1 декабря 2026, 10:00 МСК — первый рабочий день месяца. */
const DECEMBER_FIRST = new Date('2026-12-01T07:00:00Z');

const report = {
    managers: 3,
    readiness: { ok: 2, fewData: 1, noCalls: 0 },
    recommendations: {
        active: 4,
        fresh: 4,
        fixed: 0,
        escalated: 0,
        dropped: 0,
    },
    saved: { created: 3, updated: 0, unchanged: 0 },
};

/** Настоящий движок (тик и прогон периода) поверх памяти вместо Redis. */
function build(settingsPatch: Record<string, unknown>) {
    const state = {
        lock: jest.fn().mockResolvedValue('token'),
        extend: jest.fn().mockResolvedValue(undefined),
        unlock: jest.fn().mockResolvedValue(undefined),
        released: jest.fn().mockResolvedValue(null),
        markReleased: jest.fn().mockResolvedValue(undefined),
        clearFailures: jest.fn().mockResolvedValue(undefined),
        registerFailure: jest.fn().mockResolvedValue(1),
        saveLastRun: jest.fn().mockResolvedValue(undefined),
    };
    const ticker = new RopReportTicker(
        state as never,
        new RopPeriodRunner(state as never),
    );
    const values = {
        ...getPortalAppDefaults(EnumPortalAppCode.eventSales),
        periodDigestEnabled: true,
        periodDigestKinds: 'month',
        ...settingsPatch,
    };
    const settings = {
        enabledDomains: jest.fn().mockResolvedValue([DOMAIN]),
        resolveOptions: jest.fn(
            (_domain: string, overrides: { countOnly?: boolean }) =>
                Promise.resolve(periodDigestOptionsOf(values, overrides)),
        ),
    };
    const hours = fallbackWorkingHours();
    const calendar = {
        resolve: jest.fn().mockResolvedValue({
            timezone: ETimeZone.EUROPE_MOSCOW,
            calendar: { isWorkday: (day: string) => isWorkdayOf(hours, day) },
            deadline: () => DECEMBER_FIRST,
        }),
    };
    const cards = { run: jest.fn().mockResolvedValue(report) };
    const definition = new PeriodDigestDefinition(
        settings as never,
        calendar as never,
        cards as never,
    );
    return {
        state,
        cards,
        scheduler: new PeriodDigestScheduler(ticker, definition),
    };
}

/** Сообщение, ушедшее в Telegram (второй аргумент лога — { telegram: true }). */
const telegramMessages = (spy: jest.SpyInstance): string[] =>
    spy.mock.calls
        .filter(
            (call: unknown[]) =>
                (call[1] as { telegram?: boolean } | undefined)?.telegram ===
                true,
        )
        .map((call: unknown[]) => String(call[0]));

describe('крон итогов периода', () => {
    let log: jest.SpyInstance;

    beforeEach(() => {
        log = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
    });

    afterEach(() => log.mockRestore());

    it('имя крона — в ростере event-sales', () => {
        expect(PERIOD_DIGEST_CRON_NAME).toBe('event-sales-period-digest');
    });

    it('включено и «только считать» снято: месяц считается, задачи не ставятся, в итоге — «доставка ещё не подключена»', async () => {
        const { scheduler, state, cards } = build({
            periodDigestCountOnly: false,
        });

        await scheduler.tick(DECEMBER_FIRST);

        expect(cards.run).toHaveBeenCalledTimes(1);
        const [input] = cards.run.mock.calls[0] as [
            { period: { key: string } },
        ];
        expect(input.period.key).toBe('2026-11');
        const [, summary] = state.saveLastRun.mock.calls[0] as [
            string,
            RopRunSummary,
        ];
        expect(summary).toMatchObject({
            periodKey: '2026-11',
            status: 'ran',
            countOnly: true,
            recipients: 0,
            tasksCreated: 0,
        });
        expect(summary.summary).toContain(PERIOD_DIGEST_DELIVERY_PENDING_LINE);
        // Метка «только считать»: когда доставка появится, период выпустится с задачами.
        expect(state.markReleased).toHaveBeenCalledWith(
            `event-sales:period-digest:released-count:month:${DOMAIN}`,
            '2026-11',
            expect.any(Number),
        );
        const [message] = telegramMessages(log);
        expect(message).toContain('Итоги периода по менеджерам');
        expect(message).toContain('только считать — задачи не ставятся');
        expect(message).toContain('Доставка ещё не подключена');
    });

    it('«только считать» включено — строки про доставку нет', async () => {
        const { scheduler, state } = build({ periodDigestCountOnly: true });

        await scheduler.tick(DECEMBER_FIRST);

        const [, summary] = state.saveLastRun.mock.calls[0] as [
            string,
            RopRunSummary,
        ];
        expect(summary.summary).not.toContain(
            PERIOD_DIGEST_DELIVERY_PENDING_LINE,
        );
    });

    it('ещё не время (до часа выпуска) — ничего не считается', async () => {
        const { scheduler, cards } = build({ periodDigestCountOnly: false });

        await scheduler.tick(new Date('2026-12-01T05:00:00Z'));

        expect(cards.run).not.toHaveBeenCalled();
        expect(telegramMessages(log)).toEqual([]);
    });
});
