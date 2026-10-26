import { SupportMonitorTickService } from '../application/support-monitor-tick.service';
import { SupportMonitorOptions } from '../application/support-monitor-options';
import { SupportSignalDispatcher } from '../application/support-signal.dispatcher';
import { SupportSignalReport } from '../application/support-monitor.report';
import { SupportDialogMemory } from '../domain/support-dialog.types';
import { SupportLineReader } from '../infrastructure/support-line.reader';
import { SupportMonitorStore } from '../infrastructure/support-monitor.store';
import { dialog, message, minutesAfter } from './support-fixtures';

jest.mock('../infrastructure/support-line.reader');

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

const waitingDialog = dialog([message(10, 'client', 0)], { sessionId: 71 });
const answeredDialog = dialog(
    [message(20, 'client', 0), message(21, 'staff', 2)],
    { sessionId: 72, chatId: 770 },
);

function setup(memories: Map<number, SupportDialogMemory> = new Map()) {
    (SupportLineReader as jest.Mock).mockImplementation(() => ({
        readOpenDialogs: jest.fn().mockResolvedValue({
            dialogs: [waitingDialog, answeredDialog],
            warnings: [],
        }),
    }));
    const pbx = { init: jest.fn().mockResolvedValue({ bitrix: {} }) };
    const store = {
        loadMemories: jest.fn().mockResolvedValue(memories),
        saveMemory: jest.fn().mockResolvedValue(undefined),
    };
    const channels = { bell: {}, telegram: true };
    const delivered = (overrides: Partial<SupportSignalReport> = {}) =>
        jest.fn().mockImplementation((signal: { kind: string }) =>
            Promise.resolve({
                kind: signal.kind,
                sessionId: 71,
                clientName: 'Савчук Вадим',
                waitedMinutes: 0,
                bellText: 'bell',
                telegramText: 'tg',
                bellDelivered: 2,
                telegramDelivered: true,
                remembered: true,
                ...overrides,
            }),
        );
    const dispatcher = {
        openChannels: jest.fn().mockResolvedValue(channels),
        dispatch: delivered(),
    };
    const service = new SupportMonitorTickService(
        pbx as never,
        store as unknown as SupportMonitorStore,
        dispatcher as unknown as SupportSignalDispatcher,
    );
    return { service, pbx, store, dispatcher, delivered };
}

describe('SupportMonitorTickService.run', () => {
    beforeEach(() => jest.clearAllMocks());

    it('боевой такт: новые диалоги разосланы и запомнены в боевой памяти', async () => {
        const { service, pbx, store, dispatcher } = setup();
        const report = await service.run(LINE, options(), minutesAfter(1));

        expect(pbx.init).toHaveBeenCalledWith(LINE);
        expect(store.loadMemories).toHaveBeenCalledWith('live', LINE, [71, 72]);
        expect(dispatcher.openChannels).toHaveBeenCalledTimes(1);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(2);
        expect(store.saveMemory).toHaveBeenCalledWith('live', LINE, 71, {
            announced: true,
            waitingFor: 10,
            levels: [],
        });
        expect(report.signals.map(s => s.kind)).toEqual([
            'new_dialog',
            'new_dialog',
        ]);
        expect(report.dialogs.map(d => [d.sessionId, d.waitedMinutes])).toEqual(
            [
                [71, 1],
                [72, 0],
            ],
        );
    });

    it('ни один канал не принял — память не пишется, следующий просмотр повторит', async () => {
        const { service, store, dispatcher, delivered } = setup();
        dispatcher.dispatch = delivered({
            bellDelivered: 0,
            telegramDelivered: false,
            remembered: false,
        });
        await service.run(LINE, options(), minutesAfter(1));
        expect(store.saveMemory).not.toHaveBeenCalled();
    });

    it('только считать: ничего не шлём, запоминаем в пробной памяти', async () => {
        const { service, store, dispatcher } = setup();
        const report = await service.run(
            LINE,
            options({ dryRun: true }),
            minutesAfter(1),
        );
        expect(dispatcher.openChannels).not.toHaveBeenCalled();
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
        expect(store.loadMemories).toHaveBeenCalledWith('dry', LINE, [71, 72]);
        expect(store.saveMemory).toHaveBeenCalledTimes(2);
        expect((store.saveMemory.mock.calls[0] as unknown[])[0]).toBe('dry');
        expect(report.dryRun).toBe(true);
        expect(report.signals.every(s => s.remembered)).toBe(true);
        expect(report.signals[0]?.telegramText).toContain('Новый вопрос');
    });

    it('без оповещений каналы не открываются, неизменная память не перезаписывается', async () => {
        const memories = new Map<number, SupportDialogMemory>([
            [71, { announced: true, waitingFor: 10, levels: [] }],
            [72, { announced: true, waitingFor: 20, levels: ['remind'] }],
        ]);
        const { service, store, dispatcher } = setup(memories);
        const report = await service.run(LINE, options(), minutesAfter(5));

        expect(report.signals).toEqual([]);
        expect(dispatcher.openChannels).not.toHaveBeenCalled();
        // 71 ждёт 5 минут — память та же; 72 ответили — ожидание гаснет.
        expect(store.saveMemory).toHaveBeenCalledTimes(1);
        expect(store.saveMemory).toHaveBeenCalledWith('live', LINE, 72, {
            announced: true,
            waitingFor: null,
            levels: [],
        });
    });

    it('клиент ждёт 10 минут — напоминание', async () => {
        const memories = new Map<number, SupportDialogMemory>([
            [71, { announced: true, waitingFor: 10, levels: [] }],
            [72, { announced: true, waitingFor: null, levels: [] }],
        ]);
        const { service, dispatcher } = setup(memories);
        await service.run(LINE, options(), minutesAfter(11));
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
        expect((dispatcher.dispatch.mock.calls[0] as unknown[])[0]).toEqual(
            expect.objectContaining({ kind: 'waiting', waitedMinutes: 11 }),
        );
    });
});

describe('SupportMonitorTickService.preview', () => {
    it('показывает, что ушло бы, ничего не шлёт и не запоминает', async () => {
        const { service, store, dispatcher } = setup();
        const report = await service.preview(LINE, options(), minutesAfter(1));
        expect(report.signals).toHaveLength(2);
        expect(
            report.signals.every(s => !s.remembered && !s.bellDelivered),
        ).toBe(true);
        expect(store.saveMemory).not.toHaveBeenCalled();
        expect(dispatcher.openChannels).not.toHaveBeenCalled();
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });
});
