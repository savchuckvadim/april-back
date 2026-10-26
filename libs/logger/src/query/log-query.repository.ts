import {
    Injectable,
    OnModuleDestroy,
    ServiceUnavailableException,
} from '@nestjs/common';
import { createClient } from '@clickhouse/client';
import { buildClickHouseConfig } from '../config/logger.config';
import {
    buildAppsSql,
    buildDomainsSql,
    buildRowsSql,
    buildTopErrorsSql,
    LogSql,
} from './log-query.sql';
import {
    LogAppStat,
    LogDomainStat,
    LogErrorPattern,
    LogQueryFilter,
    LogRowView,
} from './log-query.types';

/** Минимальный контракт чтения: в тестах — фейк, в бою — @clickhouse/client. */
export interface LogQueryClient {
    rows<T>(sql: LogSql): Promise<T[]>;
    close(): Promise<void>;
}

type RawRow = Record<string, unknown>;

/** Числа ClickHouse (UInt64) приходят строками — приводим один раз здесь. */
const num = (value: unknown): number => Number(value) || 0;

/** Строковое поле ответа; всё прочее — пустая строка. */
const str = (value: unknown): string =>
    typeof value === 'string'
        ? value
        : typeof value === 'number'
          ? String(value)
          : '';

function createLogQueryClient(): LogQueryClient | null {
    const config = buildClickHouseConfig();
    if (!config.url) return null;
    const client = createClient({
        url: config.url,
        database: config.database,
        username: config.username,
        password: config.password,
    });
    return {
        rows: async <T>(sql: LogSql) =>
            (
                await client.query({
                    query: sql.query,
                    query_params: sql.params,
                    format: 'JSONEachRow',
                })
            ).json<T>(),
        close: () => client.close(),
    };
}

/**
 * Чтение журналов всех приложений из ClickHouse (таблица, куда пишет
 * `ClickHouseTransport`). Только SELECT, значения — параметрами.
 * Подключение — те же CLICKHOUSE_* env, что у записи; нет CLICKHOUSE_URL —
 * 503 с понятной причиной.
 */
@Injectable()
export class LogQueryRepository implements OnModuleDestroy {
    private client: LogQueryClient | null | undefined;

    /** Для тестов: подменить клиент. */
    useClient(client: LogQueryClient | null): void {
        this.client = client;
    }

    async rows(filter: LogQueryFilter, limit: number): Promise<LogRowView[]> {
        const rows = await this.query<RawRow>(buildRowsSql(filter, limit));
        return rows.map(row => ({
            at: str(row.at),
            app: str(row.app),
            env: str(row.env),
            level: str(row.level),
            context: str(row.context),
            message: str(row.message),
            meta: str(row.meta),
            trace: str(row.trace),
            domain: str(row.domain),
        }));
    }

    async apps(filter: LogQueryFilter): Promise<LogAppStat[]> {
        const rows = await this.query<RawRow>(buildAppsSql(filter));
        return rows.map(row => ({
            app: str(row.app),
            errors: num(row.errors),
            warnings: num(row.warnings),
            total: num(row.total),
            prevErrors: num(row.prevErrors),
            prevTotal: num(row.prevTotal),
            lastAt: str(row.lastAt) || null,
        }));
    }

    async topErrors(
        filter: LogQueryFilter,
        top: number,
    ): Promise<LogErrorPattern[]> {
        const rows = await this.query<RawRow>(buildTopErrorsSql(filter, top));
        return rows.map(row => ({
            app: str(row.app),
            sample: str(row.sample),
            count: num(row.count),
            firstAt: str(row.firstAt),
            lastAt: str(row.lastAt),
            domains: (Array.isArray(row.domains) ? row.domains : [])
                .map(str)
                .filter(Boolean),
        }));
    }

    async domains(
        filter: LogQueryFilter,
        top: number,
    ): Promise<LogDomainStat[]> {
        const rows = await this.query<RawRow>(buildDomainsSql(filter, top));
        return rows.map(row => ({
            domain: str(row.domain),
            errors: num(row.errors),
            warnings: num(row.warnings),
            total: num(row.total),
        }));
    }

    async onModuleDestroy(): Promise<void> {
        await this.client?.close().catch(() => undefined);
    }

    private async query<T>(sql: LogSql): Promise<T[]> {
        if (this.client === undefined) this.client = createLogQueryClient();
        if (!this.client) {
            throw new ServiceUnavailableException(
                'Журналы недоступны: не задан CLICKHOUSE_URL у этого приложения',
            );
        }
        return this.client.rows<T>(sql);
    }
}
