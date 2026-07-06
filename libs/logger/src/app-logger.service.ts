import { LoggerService, OnApplicationShutdown } from '@nestjs/common';
import * as winston from 'winston';
import {
    AppLogLevel,
    LoggerConfig,
    toWinstonLevel,
    WINSTON_LEVELS,
    WinstonLevel,
} from './config/logger.config';
import {
    TelegramSink,
    TelegramTransport,
} from './transports/telegram.transport';

/** ANSI-цвета уровней для dev-вывода (как у дефолтного логгера Nest). */
const LEVEL_COLORS: Record<WinstonLevel, string> = {
    error: '\x1b[31m',
    warn: '\x1b[33m',
    info: '\x1b[32m',
    debug: '\x1b[35m',
    verbose: '\x1b[36m',
};
const RESET = '\x1b[0m';

type Transport = winston.transport;

interface SplitParams {
    context?: string;
    trace?: string;
    rest: unknown[];
}

/**
 * Центральный логгер монорепо: реализует LoggerService, поэтому после
 * `app.useLogger(...)` через него идут все `new Logger(X.name)` приложения
 * без правки их кода.
 *
 * Каждая запись несёт метки app (имя приложения) и env (NODE_ENV).
 * Вывод: dev — цветная строка, prod — JSON-line (тот же формат уедет
 * в ClickHouse). Дополнительно (по конфигу) — Telegram-транспорт.
 */
export class AppLoggerService implements LoggerService, OnApplicationShutdown {
    private readonly winston: winston.Logger;
    private readonly extraTransports: Transport[];

    constructor(
        appName: string,
        config: LoggerConfig,
        telegramSink: TelegramSink | null = null,
        extraTransports: Transport[] = [],
    ) {
        this.extraTransports = extraTransports;
        const transports: Transport[] = [
            new winston.transports.Console({
                format: config.json
                    ? AppLoggerService.prodFormat()
                    : AppLoggerService.devFormat(),
            }),
            ...extraTransports,
        ];
        // Транспорт создаётся при наличии sink даже при telegramLevel=none:
        // точечная отправка `{ telegram: true }` должна работать всегда.
        if (telegramSink) {
            transports.push(
                new TelegramTransport({
                    sink: telegramSink,
                    minLevel: config.telegramLevel,
                }),
            );
        }

        this.winston = winston.createLogger({
            levels: { ...WINSTON_LEVELS },
            level:
                config.level === 'silent'
                    ? 'error'
                    : toWinstonLevel(config.level),
            silent: config.level === 'silent',
            defaultMeta: { app: appName, env: config.env },
            transports,
        });
    }

    log(message: unknown, ...optionalParams: unknown[]): void {
        this.write('log', message, optionalParams);
    }

    error(message: unknown, ...optionalParams: unknown[]): void {
        this.write('error', message, optionalParams);
    }

    warn(message: unknown, ...optionalParams: unknown[]): void {
        this.write('warn', message, optionalParams);
    }

    debug(message: unknown, ...optionalParams: unknown[]): void {
        this.write('debug', message, optionalParams);
    }

    verbose(message: unknown, ...optionalParams: unknown[]): void {
        this.write('verbose', message, optionalParams);
    }

    /** Nest 11: fatal маппится на error (отдельного уровня не заводим). */
    fatal(message: unknown, ...optionalParams: unknown[]): void {
        this.write('error', message, optionalParams);
    }

    /**
     * Shutdown-хук (требует app.enableShutdownHooks()): даёт транспортам
     * с буферизацией (ClickHouse) дослать накопленное перед остановкой.
     */
    async onApplicationShutdown(): Promise<void> {
        for (const transport of this.extraTransports) {
            const disposable = transport as Partial<{
                dispose: () => Promise<void>;
            }>;
            if (typeof disposable.dispose === 'function') {
                await disposable.dispose();
            }
        }
    }

    private write(
        level: AppLogLevel,
        message: unknown,
        params: unknown[],
    ): void {
        const { context, trace, rest } = this.splitParams(level, params);
        let text: string;
        let finalTrace = trace;
        if (message instanceof Error) {
            text = message.message;
            finalTrace = finalTrace ?? message.stack;
        } else {
            text = AppLoggerService.stringify(message);
        }
        const meta = AppLoggerService.buildMeta(rest);
        // Reserved-проп { telegram: true } — форс-отправка записи в Telegram;
        // из meta вырезается (в ClickHouse/консоль не попадает).
        let telegram: boolean | undefined;
        if (meta && meta.telegram === true) {
            telegram = true;
            delete meta.telegram;
        }
        this.winston.log(toWinstonLevel(level), text, {
            context,
            trace: finalTrace,
            telegram,
            meta: meta && Object.keys(meta).length > 0 ? meta : undefined,
        });
    }

    /**
     * Кастомные поля лога. Объекты-параметры сливаются в единый meta-объект:
     * `logger.log('msg', { xo: 'x77' })` → meta `{"xo":"x77"}` — по нему удобно
     * фильтровать в ClickHouse (`JSONExtractString(meta, 'xo')`).
     * Не-объектные параметры складываются в meta.params.
     */
    private static buildMeta(
        rest: unknown[],
    ): Record<string, unknown> | undefined {
        if (rest.length === 0) {
            return undefined;
        }
        const merged: Record<string, unknown> = {};
        const params: unknown[] = [];
        for (const value of rest) {
            if (
                value !== null &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                !(value instanceof Error)
            ) {
                Object.assign(merged, value);
            } else {
                params.push(value);
            }
        }
        if (params.length > 0) {
            merged.params = params;
        }
        return Object.keys(merged).length > 0 ? merged : undefined;
    }

    /**
     * Конвенция Nest: последний строковый параметр — context
     * (`new Logger('Ctx')` дописывает его сам); у error перед ним
     * может идти stack (trace).
     */
    private splitParams(level: AppLogLevel, params: unknown[]): SplitParams {
        const rest = [...params];
        let context: string | undefined;
        let trace: string | undefined;
        if (rest.length > 0 && typeof rest[rest.length - 1] === 'string') {
            context = rest.pop() as string;
        }
        if (
            level === 'error' &&
            rest.length > 0 &&
            typeof rest[rest.length - 1] === 'string'
        ) {
            trace = rest.pop() as string;
        }
        // Nest подставляет undefined вместо отсутствующего stack — в meta не тащим.
        return {
            context,
            trace,
            rest: rest.filter(p => p !== undefined && p !== null),
        };
    }

    private static stringify(message: unknown): string {
        if (typeof message === 'string') {
            return message;
        }
        try {
            return JSON.stringify(message);
        } catch {
            return String(message);
        }
    }

    /** prod: JSON-line `{timestamp, level, message, app, env, context?, trace?, meta?}`. */
    private static prodFormat(): winston.Logform.Format {
        return winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
        );
    }

    /** dev: `12:30:45 [app] LOG [Context] message` с цветом уровня. */
    private static devFormat(): winston.Logform.Format {
        return winston.format.combine(
            winston.format.timestamp({ format: 'HH:mm:ss' }),
            winston.format.printf(info => {
                const level = info.level as WinstonLevel;
                const color = LEVEL_COLORS[level] ?? '';
                const context =
                    typeof info.context === 'string' && info.context
                        ? ` \x1b[33m[${info.context}]\x1b[0m`
                        : '';
                const trace =
                    typeof info.trace === 'string' && info.trace
                        ? `\n${info.trace}`
                        : '';
                return `${String(info.timestamp)} [${String(info.app)}] ${color}${level.toUpperCase()}${RESET}${context} ${String(info.message)}${trace}`;
            }),
        );
    }
}
