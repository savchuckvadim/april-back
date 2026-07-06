import Transport from 'winston-transport';
import { TelegramLogLevel, WINSTON_LEVELS } from '../config/logger.config';

/**
 * Минимальный контракт отправки в Telegram — совпадает с
 * TelegramService.sendMessage из @lib/telegram, но транспорт не привязан
 * к конкретной реализации (в тестах подставляется фейк).
 */
export interface TelegramSink {
    sendMessage(message: string): Promise<unknown> | void;
}

/** Поля лог-записи, которые кладёт AppLoggerService (+ defaultMeta app/env). */
export interface AppLogInfo {
    level: string;
    message: unknown;
    app?: string;
    env?: string;
    context?: string;
    trace?: string;
    /** true — форс-отправка этой записи в Telegram (проп `{ telegram: true }`). */
    telegram?: boolean;
    [key: string]: unknown;
}

export interface TelegramTransportOptions {
    /** Куда слать. null — транспорт молча ничего не делает. */
    sink: TelegramSink | null;
    /**
     * Глобальный минимальный уровень ('error' | 'none'). При 'none' транспорт
     * шлёт ТОЛЬКО записи с форс-флагом `{ telegram: true }`.
     */
    minLevel: TelegramLogLevel;
    /** Троттлинг: максимум сообщений в минуту (защита от флуда). */
    maxPerMinute?: number;
}

const DEFAULT_MAX_PER_MINUTE = 20;
const WINDOW_MS = 60_000;

/**
 * Winston-транспорт «лог → Telegram».
 *
 * Принципы:
 * - fire-and-forget: отправка не ждётся и не влияет на поток приложения;
 * - ошибки отправки только в console.error (НЕ в логгер — иначе рекурсия
 *   «лог об ошибке лога»);
 * - троттлинг по скользящему окну в минуту — чтобы взрыв ошибок не
 *   зафлудил чат и не упёрся в лимиты Telegram API.
 */
export class TelegramTransport extends Transport {
    private readonly sink: TelegramSink | null;
    private readonly minLevel: TelegramLogLevel;
    private readonly maxPerMinute: number;
    private sentAt: number[] = [];

    constructor(options: TelegramTransportOptions) {
        // Уровень на транспорте не ставим: фильтруем сами в log(), чтобы
        // работал точечный форс-флаг { telegram: true } с любым уровнем.
        super({});
        this.sink = options.sink;
        this.minLevel = options.minLevel;
        this.maxPerMinute = options.maxPerMinute ?? DEFAULT_MAX_PER_MINUTE;
    }

    log(info: AppLogInfo, callback: () => void): void {
        setImmediate(() => this.emit('logged', info));
        try {
            if (
                this.sink &&
                this.shouldSend(info) &&
                !this.isThrottled(Date.now())
            ) {
                const text = TelegramTransport.formatMessage(info);
                void Promise.resolve(this.sink.sendMessage(text)).catch(
                    (error: unknown) =>
                        console.error('TelegramTransport: send failed', error),
                );
            }
        } catch (error) {
            console.error('TelegramTransport: unexpected error', error);
        }
        callback();
    }

    /**
     * Отправлять ли запись: форс-флаг `{ telegram: true }` — всегда;
     * иначе — по глобальному minLevel ('error' → только ошибки, 'none' — ничего).
     */
    private shouldSend(info: AppLogInfo): boolean {
        if (info.telegram === true) {
            return true;
        }
        if (this.minLevel === 'none') {
            return false;
        }
        const priority =
            WINSTON_LEVELS[info.level as keyof typeof WINSTON_LEVELS];
        return priority !== undefined && priority <= WINSTON_LEVELS.error;
    }

    /** true — лимит сообщений в минуту исчерпан, запись пропускается. */
    private isThrottled(now: number): boolean {
        this.sentAt = this.sentAt.filter(ts => now - ts < WINDOW_MS);
        if (this.sentAt.length >= this.maxPerMinute) {
            return true;
        }
        this.sentAt.push(now);
        return false;
    }

    private static formatMessage(info: AppLogInfo): string {
        const header = `🖥 [${info.app ?? '?'}][${info.env ?? '?'}] ${info.level.toUpperCase()}`;
        const context = info.context ? ` [${info.context}]` : '';
        const trace = info.trace ? `\n${info.trace}` : '';
        return `${header}${context}\n${String(info.message)}${trace}`;
    }
}
