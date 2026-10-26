import { findMissingModuleDependencies } from '@lib/core/testing/module-di';
import {
    SupportMonitorOptions,
    SupportMonitorSettingsService,
    SupportMonitorStore,
    SupportMonitorTickService,
    SupportTelegramNotifier,
} from '@lib/support';
import { SupportMonitorScheduler } from '../support-monitor.scheduler';
import { SupportMonitorBotModule } from '../support-monitor-bot.module';
import { formatSupportRoster } from '../support-monitor-roster';

const options = (
    overrides: Partial<SupportMonitorOptions> = {},
): SupportMonitorOptions => ({
    enabled: true,
    dryRun: false,
    lineId: 9,
    notifyDomain: 'april-garant.bitrix24.ru',
    notifyUserIds: [1, 135],
    thresholds: { remindMinutes: 10, escalateMinutes: 30 },
    pollMinutes: 3,
    telegramEnabled: true,
    ...overrides,
});

function setup(domains: string[] = ['april-dev.bitrix24.ru']) {
    const settings = {
        listEnabledDomains: jest.fn().mockResolvedValue(domains),
        resolveOptions: jest.fn().mockResolvedValue(options()),
    };
    const tick = { run: jest.fn().mockResolvedValue(undefined) };
    const store = {
        acquireLock: jest.fn().mockResolvedValue(true),
        releaseLock: jest.fn().mockResolvedValue(undefined),
        claimPoll: jest.fn().mockResolvedValue(true),
        allowAlert: jest.fn().mockResolvedValue(true),
    };
    const telegram = { isConfigured: jest.fn().mockReturnValue(true) };
    const scheduler = new SupportMonitorScheduler(
        settings as unknown as SupportMonitorSettingsService,
        tick as unknown as SupportMonitorTickService,
        store as unknown as SupportMonitorStore,
        telegram as unknown as SupportTelegramNotifier,
    );
    const logger = (
        scheduler as unknown as { logger: Record<string, jest.Mock> }
    ).logger;
    logger.error = jest.fn();
    logger.log = jest.fn();
    logger.debug = jest.fn();
    return { scheduler, settings, tick, store, logger };
}

describe('SupportMonitorScheduler', () => {
    it('нигде не включён — лок не берётся', async () => {
        const { scheduler, store, tick } = setup([]);
        await scheduler.tick();
        expect(store.acquireLock).not.toHaveBeenCalled();
        expect(tick.run).not.toHaveBeenCalled();
    });

    it('смотрит линию, когда пришло её окно, и отпускает лок', async () => {
        const { scheduler, store, tick } = setup();
        await scheduler.tick();
        expect(store.claimPoll).toHaveBeenCalledWith(
            'april-dev.bitrix24.ru',
            3,
        );
        expect(tick.run).toHaveBeenCalledWith(
            'april-dev.bitrix24.ru',
            options(),
        );
        expect(store.releaseLock).toHaveBeenCalled();
    });

    it('окно ещё не пришло — линию не трогает', async () => {
        const { scheduler, store, tick } = setup();
        store.claimPoll.mockResolvedValue(false);
        await scheduler.tick();
        expect(tick.run).not.toHaveBeenCalled();
    });

    it('другой процесс держит лок — тик пропущен', async () => {
        const { scheduler, store, tick } = setup();
        store.acquireLock.mockResolvedValue(false);
        await scheduler.tick();
        expect(tick.run).not.toHaveBeenCalled();
        expect(store.releaseLock).not.toHaveBeenCalled();
    });

    it('сбой портала: тревога в Telegram не чаще раза в час, лок отпущен', async () => {
        const { scheduler, store, tick, logger } = setup([
            'april-dev.bitrix24.ru',
            'gsr.bitrix24.ru',
        ]);
        tick.run.mockRejectedValueOnce(new Error('QUERY_LIMIT_EXCEEDED'));
        await scheduler.tick();
        expect(tick.run).toHaveBeenCalledTimes(2);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('QUERY_LIMIT_EXCEEDED'),
            { telegram: true },
        );

        store.allowAlert.mockResolvedValue(false);
        tick.run.mockRejectedValueOnce(new Error('снова'));
        await scheduler.tick();
        expect(logger.error).toHaveBeenLastCalledWith(
            expect.stringContaining('снова'),
            {},
        );
        expect(store.releaseLock).toHaveBeenCalledTimes(2);
    });

    it('выключили между чтением ростера и просмотром — не смотрит', async () => {
        const { scheduler, settings, tick } = setup();
        settings.resolveOptions.mockResolvedValue(options({ enabled: false }));
        await scheduler.tick();
        expect(tick.run).not.toHaveBeenCalled();
    });

    it('БД недоступна — тик пропущен без исключения', async () => {
        const { scheduler, settings, store } = setup();
        settings.listEnabledDomains.mockRejectedValue(new Error('db down'));
        await expect(scheduler.tick()).resolves.toBeUndefined();
        expect(store.acquireLock).not.toHaveBeenCalled();
    });
});

describe('formatSupportRoster', () => {
    it('режим, линия, получатели и Telegram по каждому порталу', () => {
        const text = formatSupportRoster(
            [
                {
                    domain: 'april-dev.bitrix24.ru',
                    options: options({ dryRun: true }),
                },
                {
                    domain: 'gsr.bitrix24.ru',
                    options: options({
                        lineId: 0,
                        notifyUserIds: [],
                        telegramEnabled: false,
                    }),
                },
            ],
            false,
        );
        expect(text.split('\n')).toEqual([
            'Мониторинг поддержки включён:',
            '• april-dev.bitrix24.ru: линия 9, только считать, колокольчик 2 сотр. на april-garant.bitrix24.ru, Telegram не настроен на сервере, просмотр раз в 3 мин, напоминание 10 / 30 мин',
            '• gsr.bitrix24.ru: все линии, оповещает, колокольчик выключен (нет получателей), Telegram выключен, просмотр раз в 3 мин, напоминание 10 / 30 мин',
        ]);
    });

    it('пустой ростер', () => {
        expect(formatSupportRoster([], true)).toBe(
            'Мониторинг поддержки: не включён ни на одном портале',
        );
    });
});

describe('DI-граф SupportMonitorBotModule', () => {
    it('крону доступны все сервисы библиотеки', () => {
        expect(findMissingModuleDependencies(SupportMonitorBotModule)).toEqual(
            [],
        );
    });
});
