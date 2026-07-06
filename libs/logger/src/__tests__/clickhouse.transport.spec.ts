import { ClickHouseLoggerConfig } from '../config/logger.config';
import {
    AppLogRow,
    ClickHouseSink,
    ClickHouseTransport,
} from '../transports/clickhouse.transport';
import { AppLogInfo } from '../transports/telegram.transport';

const baseConfig: ClickHouseLoggerConfig = {
    enabled: true,
    url: 'http://clickhouse:8123',
    database: 'logs',
    username: 'default',
    password: '',
    flushIntervalMs: 5000,
    maxBatch: 3,
};

class FakeSink implements ClickHouseSink {
    public readonly batches: AppLogRow[][] = [];
    public failNext = false;
    public closed = false;

    insert(rows: AppLogRow[]): Promise<unknown> {
        if (this.failNext) {
            this.failNext = false;
            return Promise.reject(new Error('CH down'));
        }
        this.batches.push(rows);
        return Promise.resolve();
    }

    close(): Promise<void> {
        this.closed = true;
        return Promise.resolve();
    }
}

const makeInfo = (overrides: Partial<AppLogInfo> = {}): AppLogInfo => ({
    level: 'info',
    message: 'сообщение',
    app: 'admin',
    env: 'production',
    ...overrides,
});

const makeTransport = (config: Partial<ClickHouseLoggerConfig> = {}) => {
    const sink = new FakeSink();
    const transport = new ClickHouseTransport(
        { ...baseConfig, ...config },
        sink,
    );
    return { transport, sink };
};

/** Дожидается микротасок (асинхронный insert внутри flush). */
const flushPromises = () =>
    new Promise<void>(resolve => process.nextTick(resolve));

describe('ClickHouseTransport', () => {
    // nextTick/setImmediate не фейкаем: на них построен flushPromises
    // и fire-and-forget внутри транспорта.
    beforeEach(() =>
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }),
    );
    afterEach(() => jest.useRealTimers());

    it('копит буфер и сбрасывает при достижении maxBatch', async () => {
        const { transport, sink } = makeTransport({ maxBatch: 3 });

        transport.log(makeInfo({ message: '1' }), jest.fn());
        transport.log(makeInfo({ message: '2' }), jest.fn());
        expect(sink.batches).toHaveLength(0);

        transport.log(makeInfo({ message: '3' }), jest.fn());
        await flushPromises();

        expect(sink.batches).toHaveLength(1);
        expect(sink.batches[0].map(r => r.message)).toEqual(['1', '2', '3']);
    });

    it('сбрасывает буфер по таймеру, не дожидаясь maxBatch', async () => {
        const { transport, sink } = makeTransport({
            maxBatch: 100,
            flushIntervalMs: 5000,
        });

        transport.log(makeInfo(), jest.fn());
        jest.advanceTimersByTime(5001);
        await flushPromises();

        expect(sink.batches).toHaveLength(1);
    });

    it('маппит поля записи в строку таблицы', async () => {
        const { transport, sink } = makeTransport({ maxBatch: 1 });

        transport.log(
            makeInfo({
                level: 'error',
                context: 'PaymentService',
                trace: 'stack...',
                meta: { xo: 'x77', dealId: 42 },
            }),
            jest.fn(),
        );
        await flushPromises();

        const row = sink.batches[0][0];
        expect(row).toMatchObject({
            app: 'admin',
            env: 'production',
            level: 'error',
            context: 'PaymentService',
            message: 'сообщение',
            trace: 'stack...',
            meta: '{"xo":"x77","dealId":42}',
        });
        // DateTime64(3): 'YYYY-MM-DD HH:mm:ss.SSS'
        expect(row.timestamp).toMatch(
            /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/,
        );
    });

    it('fail-open: ошибка insert дропает батч и не бросает исключение', async () => {
        const consoleSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);
        const { transport, sink } = makeTransport({ maxBatch: 1 });
        sink.failNext = true;

        transport.log(makeInfo({ message: 'потеряется' }), jest.fn());
        await flushPromises();

        expect(sink.batches).toHaveLength(0);
        expect(consoleSpy).toHaveBeenCalled();

        // следующий батч уходит нормально
        transport.log(makeInfo({ message: 'дойдёт' }), jest.fn());
        await flushPromises();
        expect(sink.batches).toHaveLength(1);
        consoleSpy.mockRestore();
    });

    it('буфер ограничен: при переполнении выкидываются старые записи', () => {
        // maxBatch больше потолка → авто-flush не срабатывает, буфер копится
        const { transport } = makeTransport({ maxBatch: 100_000 });

        for (let i = 0; i < 5_100; i++) {
            transport.log(makeInfo({ message: `msg ${i}` }), jest.fn());
        }

        const buffer = (transport as unknown as { buffer: AppLogRow[] }).buffer;
        expect(buffer.length).toBeLessThanOrEqual(5_000);
        expect(buffer[0].message).toBe('msg 100');
    });

    it('гигантские поля обрезаются (защита памяти и таблицы)', async () => {
        const { transport, sink } = makeTransport({ maxBatch: 1 });

        transport.log(
            makeInfo({
                message: 'x'.repeat(100_000),
                trace: 't'.repeat(100_000),
            }),
            jest.fn(),
        );
        await flushPromises();

        const row = sink.batches[0][0];
        expect(row.message.length).toBeLessThanOrEqual(8_192 + 20);
        expect(row.message).toContain('[truncated]');
        expect(row.trace.length).toBeLessThanOrEqual(16_384 + 20);
    });

    it('буфер ограничен и по байтам: шторм больших логов не раздувает память', () => {
        const { transport } = makeTransport({ maxBatch: 100_000 });

        // ~8KB на запись после обрезки; 5000 записей превысили бы 16MB
        for (let i = 0; i < 5_000; i++) {
            transport.log(makeInfo({ message: 'y'.repeat(8_192) }), jest.fn());
        }

        const inner = transport as unknown as {
            buffer: AppLogRow[];
            bufferBytes: number;
        };
        expect(inner.bufferBytes).toBeLessThanOrEqual(16 * 1024 * 1024);
        expect(inner.buffer.length).toBeLessThan(5_000);
    });

    it('dispose дожимает буфер, закрывает соединение и останавливает таймер', async () => {
        const { transport, sink } = makeTransport({ maxBatch: 100 });

        transport.log(makeInfo({ message: 'хвост' }), jest.fn());
        await transport.dispose();

        expect(sink.batches).toHaveLength(1);
        expect(sink.batches[0][0].message).toBe('хвост');
        expect(sink.closed).toBe(true);

        // после dispose таймер не пытается слать снова
        jest.advanceTimersByTime(60_000);
        await flushPromises();
        expect(sink.batches).toHaveLength(1);
    });

    it('повторный dispose безопасен', async () => {
        const { transport, sink } = makeTransport();
        await transport.dispose();
        await expect(transport.dispose()).resolves.toBeUndefined();
        expect(sink.closed).toBe(true);
    });
});
