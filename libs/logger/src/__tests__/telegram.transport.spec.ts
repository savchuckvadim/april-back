import {
    AppLogInfo,
    TelegramTransport,
} from '../transports/telegram.transport';

const makeInfo = (overrides: Partial<AppLogInfo> = {}): AppLogInfo => ({
    level: 'error',
    message: 'Что-то упало',
    app: 'admin',
    env: 'production',
    ...overrides,
});

/** Дожидается микротасок (fire-and-forget промисов отправки). */
const flushPromises = () =>
    new Promise<void>(resolve => process.nextTick(resolve));

describe('TelegramTransport', () => {
    it('отправляет сообщение с метками app/env, уровнем, контекстом и trace', () => {
        const sendMessage = jest.fn<Promise<void>, [string]>(() =>
            Promise.resolve(),
        );
        const transport = new TelegramTransport({
            sink: { sendMessage },
            minLevel: 'error',
        });
        const callback = jest.fn();

        transport.log(
            makeInfo({ context: 'PaymentService', trace: 'stacktrace...' }),
            callback,
        );

        expect(callback).toHaveBeenCalled();
        expect(sendMessage).toHaveBeenCalledTimes(1);
        const text = sendMessage.mock.calls[0][0];
        expect(text).toContain('[admin][production] ERROR');
        expect(text).toContain('[PaymentService]');
        expect(text).toContain('Что-то упало');
        expect(text).toContain('stacktrace...');
    });

    it('без sink ничего не делает и не падает', () => {
        const transport = new TelegramTransport({
            sink: null,
            minLevel: 'error',
        });
        const callback = jest.fn();

        expect(() => transport.log(makeInfo(), callback)).not.toThrow();
        expect(callback).toHaveBeenCalled();
    });

    it('ошибка отправки проглатывается (console.error, без исключений)', async () => {
        const consoleSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);
        const sendMessage = jest.fn().mockRejectedValue(new Error('network'));
        const transport = new TelegramTransport({
            sink: { sendMessage },
            minLevel: 'error',
        });

        expect(() => transport.log(makeInfo(), jest.fn())).not.toThrow();
        await flushPromises();

        expect(consoleSpy).toHaveBeenCalledWith(
            'TelegramTransport: send failed',
            expect.any(Error),
        );
        consoleSpy.mockRestore();
    });

    it('синхронное исключение sink не роняет процесс', () => {
        const consoleSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);
        const transport = new TelegramTransport({
            sink: {
                sendMessage: () => {
                    throw new Error('sync boom');
                },
            },
            minLevel: 'error',
        });
        const callback = jest.fn();

        expect(() => transport.log(makeInfo(), callback)).not.toThrow();
        expect(callback).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    describe('minLevel и форс-флаг { telegram: true }', () => {
        it('при minLevel=error не-error уровни не отправляются', () => {
            const sendMessage = jest.fn<Promise<void>, [string]>(() =>
                Promise.resolve(),
            );
            const transport = new TelegramTransport({
                sink: { sendMessage },
                minLevel: 'error',
            });

            transport.log(makeInfo({ level: 'warn' }), jest.fn());
            transport.log(makeInfo({ level: 'info' }), jest.fn());

            expect(sendMessage).not.toHaveBeenCalled();
        });

        it('при minLevel=none обычные ошибки не шлются, а telegram:true — шлётся', () => {
            const sendMessage = jest.fn<Promise<void>, [string]>(() =>
                Promise.resolve(),
            );
            const transport = new TelegramTransport({
                sink: { sendMessage },
                minLevel: 'none',
            });

            transport.log(makeInfo({ level: 'error' }), jest.fn());
            expect(sendMessage).not.toHaveBeenCalled();

            transport.log(
                makeInfo({ level: 'info', telegram: true, message: 'важно' }),
                jest.fn(),
            );
            expect(sendMessage).toHaveBeenCalledTimes(1);
            expect(sendMessage.mock.calls[0][0]).toContain('важно');
        });
    });

    describe('троттлинг', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        });
        afterEach(() => jest.useRealTimers());

        it('не шлёт больше maxPerMinute сообщений в минуту', () => {
            const sendMessage = jest.fn().mockResolvedValue(undefined);
            const transport = new TelegramTransport({
                sink: { sendMessage },
                minLevel: 'error',
                maxPerMinute: 3,
            });

            for (let i = 0; i < 5; i++) {
                transport.log(makeInfo({ message: `msg ${i}` }), jest.fn());
            }

            expect(sendMessage).toHaveBeenCalledTimes(3);
        });

        it('после истечения окна отправка возобновляется', () => {
            const sendMessage = jest.fn().mockResolvedValue(undefined);
            const transport = new TelegramTransport({
                sink: { sendMessage },
                minLevel: 'error',
                maxPerMinute: 2,
            });

            transport.log(makeInfo(), jest.fn());
            transport.log(makeInfo(), jest.fn());
            transport.log(makeInfo(), jest.fn());
            expect(sendMessage).toHaveBeenCalledTimes(2);

            jest.setSystemTime(new Date('2026-01-01T00:01:01Z'));
            transport.log(makeInfo(), jest.fn());
            expect(sendMessage).toHaveBeenCalledTimes(3);
        });
    });
});
