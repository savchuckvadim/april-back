import { createClient } from '@clickhouse/client';
import Transport from 'winston-transport';
import { ClickHouseLoggerConfig } from '../config/logger.config';
import { AppLogInfo } from './telegram.transport';

/** Строка таблицы logs.app_logs (см. infra/clickhouse/init/01-logs.sql). */
export interface AppLogRow {
    timestamp: string;
    app: string;
    env: string;
    level: string;
    context: string;
    message: string;
    meta: string;
    trace: string;
}

/**
 * Минимальный контракт клиента ClickHouse — в тестах подставляется фейк,
 * в бою — @clickhouse/client.
 */
export interface ClickHouseSink {
    insert(rows: AppLogRow[]): Promise<unknown>;
    close(): Promise<void>;
}

const TABLE = 'app_logs';
/** Жёсткий потолок буфера (записей): при недоступном ClickHouse старые выкидываются. */
const MAX_BUFFER = 5_000;
/** Потолок буфера в байтах (~символах) — гарантия, что память не переполнится. */
const MAX_BUFFER_BYTES = 16 * 1024 * 1024;
/** Максимальная длина одного поля записи — гигантский payload не раздует память/таблицу. */
const MAX_FIELD_LENGTH = 8_192;
const MAX_TRACE_LENGTH = 16_384;

/** Обёртка @clickhouse/client под контракт ClickHouseSink. */
export function createClickHouseSink(
    config: ClickHouseLoggerConfig,
): ClickHouseSink {
    const client = createClient({
        url: config.url,
        database: config.database,
        username: config.username,
        password: config.password,
    });
    return {
        insert: rows =>
            client.insert({
                table: TABLE,
                values: rows,
                format: 'JSONEachRow',
            }),
        close: () => client.close(),
    };
}

/**
 * Winston-транспорт «лог → ClickHouse» с батчингом.
 *
 * Принципы:
 * - записи копятся в буфер и уходят батчем — по размеру (maxBatch) или
 *   по таймеру (flushIntervalMs); никаких сетевых вызовов на каждый лог;
 * - fail-open: ClickHouse недоступен → батч дропается с console.error,
 *   приложение не падает и не блокируется;
 * - буфер ограничен (drop-oldest) — недоступный ClickHouse не съест память;
 * - dispose() (вызывается на shutdown приложения) дожимает остаток буфера.
 */
export class ClickHouseTransport extends Transport {
    private readonly sink: ClickHouseSink;
    private readonly maxBatch: number;
    private buffer: AppLogRow[] = [];
    private bufferBytes = 0;
    private readonly timer: NodeJS.Timeout;
    private disposed = false;

    constructor(config: ClickHouseLoggerConfig, sink?: ClickHouseSink) {
        super({});
        this.sink = sink ?? createClickHouseSink(config);
        this.maxBatch = config.maxBatch;
        // unref: таймер не держит процесс живым при завершении.
        this.timer = setInterval(() => {
            void this.flush();
        }, config.flushIntervalMs);
        this.timer.unref();
    }

    log(info: AppLogInfo, callback: () => void): void {
        setImmediate(() => this.emit('logged', info));
        const row = ClickHouseTransport.toRow(info);
        this.buffer.push(row);
        this.bufferBytes += ClickHouseTransport.rowSize(row);
        // Двойной потолок буфера (записи И байты): даже при лежащем ClickHouse
        // и шторме больших логов память процесса не растёт — старое выкидывается.
        while (
            this.buffer.length > MAX_BUFFER ||
            this.bufferBytes > MAX_BUFFER_BYTES
        ) {
            const dropped = this.buffer.shift();
            if (!dropped) {
                break;
            }
            this.bufferBytes -= ClickHouseTransport.rowSize(dropped);
        }
        if (this.buffer.length >= this.maxBatch) {
            void this.flush();
        }
        callback();
    }

    /** Отправляет накопленный буфер. Ошибки — console.error (без рекурсии в логгер). */
    async flush(): Promise<void> {
        if (this.buffer.length === 0) {
            return;
        }
        const batch = this.buffer;
        this.buffer = [];
        this.bufferBytes = 0;
        try {
            await this.sink.insert(batch);
        } catch (error) {
            console.error(
                `ClickHouseTransport: insert failed, dropped ${batch.length} log rows`,
                error,
            );
        }
    }

    /** Останавливает таймер, дожимает буфер и закрывает соединение. */
    async dispose(): Promise<void> {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        clearInterval(this.timer);
        await this.flush();
        try {
            await this.sink.close();
        } catch (error) {
            console.error('ClickHouseTransport: close failed', error);
        }
    }

    private static toRow(info: AppLogInfo): AppLogRow {
        return {
            // DateTime64(3): 'YYYY-MM-DD HH:mm:ss.SSS' (UTC)
            timestamp: new Date()
                .toISOString()
                .replace('T', ' ')
                .replace('Z', ''),
            app: info.app ?? '',
            env: info.env ?? '',
            level: info.level,
            context: truncate(info.context ?? '', MAX_FIELD_LENGTH),
            message: truncate(String(info.message), MAX_FIELD_LENGTH),
            meta: truncate(
                info.meta !== undefined ? safeJson(info.meta) : '',
                MAX_FIELD_LENGTH,
            ),
            trace: truncate(info.trace ?? '', MAX_TRACE_LENGTH),
        };
    }

    /** Приблизительный размер строки таблицы в памяти (символы полей). */
    private static rowSize(row: AppLogRow): number {
        return (
            row.message.length +
            row.meta.length +
            row.trace.length +
            row.context.length +
            64
        );
    }
}

function truncate(value: string, max: number): string {
    return value.length > max ? `${value.slice(0, max)}…[truncated]` : value;
}

function safeJson(value: unknown): string {
    try {
        return JSON.stringify(value) ?? '';
    } catch {
        return String(value);
    }
}
