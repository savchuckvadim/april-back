import { SupportSignalDispatcher } from '../application/support-signal.dispatcher';
import { SupportMonitorOptions } from '../application/support-monitor-options';
import { SupportSignal } from '../domain/support-dialog.types';
import { SupportBellNotifier } from '../infrastructure/support-bell.notifier';
import { SupportTelegramNotifier } from '../infrastructure/support-telegram.notifier';
import { dialog, message } from './support-fixtures';

const LINE = 'april-dev.bitrix24.ru';

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

const pending = message(10, 'client', 0, 'Не открывается отчёт');
const signal: SupportSignal = {
    kind: 'waiting',
    dialog: dialog([pending]),
    pending,
    waitedMinutes: 12,
};

function setup({ telegramConfigured = true, telegramSent = true } = {}) {
    const systemAdd = jest.fn().mockResolvedValue({ result: 1 });
    const pbx = {
        initWebhook: jest
            .fn()
            .mockResolvedValue({ bitrix: { imNotify: { systemAdd } } }),
    };
    const telegram = {
        isConfigured: jest.fn().mockReturnValue(telegramConfigured),
        send: jest.fn().mockResolvedValue(telegramSent),
    };
    const dispatcher = new SupportSignalDispatcher(
        pbx as never,
        telegram as unknown as SupportTelegramNotifier,
    );
    return { dispatcher, pbx, telegram, systemAdd };
}

describe('SupportSignalDispatcher', () => {
    it('колокольчик открывается на портале оповещений, а не линии', async () => {
        const { dispatcher, pbx } = setup();
        const warnings: string[] = [];
        const channels = await dispatcher.openChannels(options(), warnings);
        expect(pbx.initWebhook).toHaveBeenCalledWith(
            'april-garant.bitrix24.ru',
        );
        expect(channels.bell).toBeInstanceOf(SupportBellNotifier);
        expect(channels.telegram).toBe(true);
        expect(warnings).toEqual([]);
    });

    it('нет получателей и Telegram — замечание «некуда отправить»', async () => {
        const { dispatcher, pbx } = setup({ telegramConfigured: false });
        const warnings: string[] = [];
        const channels = await dispatcher.openChannels(
            options({ notifyUserIds: [] }),
            warnings,
        );
        expect(pbx.initWebhook).not.toHaveBeenCalled();
        expect(channels).toEqual({ bell: null, telegram: false });
        expect(warnings[0]).toContain('некуда отправить');
    });

    it('Telegram выключен в настройках — не шлём, даже если бот задан', async () => {
        const { dispatcher } = setup();
        const channels = await dispatcher.openChannels(
            options({ telegramEnabled: false }),
            [],
        );
        expect(channels.telegram).toBe(false);
    });

    it('портал колокольчика недоступен — замечание, Telegram работает', async () => {
        const { dispatcher, pbx } = setup();
        pbx.initWebhook.mockRejectedValueOnce(new Error('нет ключа'));
        const warnings: string[] = [];
        const channels = await dispatcher.openChannels(options(), warnings);
        expect(channels).toEqual({ bell: null, telegram: true });
        expect(warnings[0]).toContain('april-garant.bitrix24.ru недоступен');
    });

    it('рассылка: колокольчик каждому с тегом диалога и Telegram', async () => {
        const { dispatcher, telegram, systemAdd } = setup();
        const channels = await dispatcher.openChannels(options(), []);
        const report = await dispatcher.dispatch(
            signal,
            LINE,
            options(),
            channels,
        );
        expect(systemAdd).toHaveBeenCalledTimes(2);
        expect(systemAdd).toHaveBeenCalledWith(
            expect.objectContaining({
                USER_ID: 135,
                TAG: 'support-monitor:april-dev.bitrix24.ru:71',
                MESSAGE: expect.stringContaining(
                    '[B]Клиент ждёт ответа 12 мин[/B]',
                ) as string,
            }),
        );
        expect(telegram.send).toHaveBeenCalledWith(
            expect.stringContaining('⏳ <b>Клиент ждёт ответа 12 мин</b>'),
        );
        expect(report).toEqual(
            expect.objectContaining({
                bellDelivered: 2,
                telegramDelivered: true,
                remembered: true,
            }),
        );
    });

    it('колокольчик одному сотруднику упал — остальным доставлен', async () => {
        const { dispatcher, systemAdd } = setup({ telegramSent: false });
        systemAdd.mockRejectedValueOnce(new Error('USER_NOT_FOUND'));
        const channels = await dispatcher.openChannels(options(), []);
        const report = await dispatcher.dispatch(
            signal,
            LINE,
            options(),
            channels,
        );
        expect(report.bellDelivered).toBe(1);
        expect(report.remembered).toBe(true);
    });

    it('ни один канал не принял — не запоминаем', async () => {
        const { dispatcher } = setup({ telegramSent: false });
        const report = await dispatcher.dispatch(signal, LINE, options(), {
            bell: null,
            telegram: true,
        });
        expect(report.remembered).toBe(false);
    });
});
