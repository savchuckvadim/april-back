import { DynamicModule, Global, Module } from '@nestjs/common';
import { TelegramService } from '@lib/telegram';
import { AppLoggerService } from './app-logger.service';
import {
    buildClickHouseConfig,
    buildLoggerConfig,
} from './config/logger.config';
import { ClickHouseTransport } from './transports/clickhouse.transport';

export const LOGGER_MODULE_OPTIONS = Symbol('LOGGER_MODULE_OPTIONS');

export interface LoggerModuleOptions {
    /** Имя приложения — метка `app` во всех его логах. */
    appName: string;
}

/**
 * Централизованный логгер монорепо.
 *
 * Подключение (один раз в корневом модуле приложения):
 * ```ts
 * imports: [LoggerModule.forRoot({ appName: 'admin' })]
 * ```
 * и в main.ts / bootstrapApp:
 * ```ts
 * app.useLogger(app.get(AppLoggerService));
 * ```
 *
 * TelegramService опционален: если приложение не подключило TelegramModule,
 * логгер работает без Telegram-транспорта (и наоборот — включается только
 * при LOG_TELEGRAM_LEVEL=error).
 */
@Global()
@Module({})
export class LoggerModule {
    static forRoot(options: LoggerModuleOptions): DynamicModule {
        return {
            module: LoggerModule,
            providers: [
                { provide: LOGGER_MODULE_OPTIONS, useValue: options },
                {
                    provide: AppLoggerService,
                    // useFactory: конфиг читает process.env на этапе DI —
                    // после того как ConfigModule приложения загрузил .env.
                    inject: [
                        LOGGER_MODULE_OPTIONS,
                        { token: TelegramService, optional: true },
                    ],
                    useFactory: (
                        opts: LoggerModuleOptions,
                        telegram?: TelegramService,
                    ) => {
                        const clickHouse = buildClickHouseConfig();
                        return new AppLoggerService(
                            opts.appName,
                            buildLoggerConfig(),
                            telegram ?? null,
                            clickHouse.enabled
                                ? [new ClickHouseTransport(clickHouse)]
                                : [],
                        );
                    },
                },
            ],
            exports: [AppLoggerService],
        };
    }
}
