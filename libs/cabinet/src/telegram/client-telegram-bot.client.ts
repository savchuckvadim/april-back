import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EgressProxyService } from '@lib/egress-proxy';
import {
    callTelegramBotApi,
    fetchTelegramBotUsername,
    TELEGRAM_MAX_TEXT,
    TelegramBotApiTransport,
    telegramWebhookSecret,
} from '@lib/telegram';
import {
    envOnlyReader,
    VENDOR_SETTINGS_READER,
    VendorSettingsReader,
} from '@lib/vendor-settings';
import { CABINET_TELEGRAM_SETTING_KEYS } from '../domain/cabinet.constants';

/** Не удалось узнать имя бота — следующая попытка не раньше чем через минуту. */
const USERNAME_RETRY_MS = 60_000;
/** Соль секрета вебхука клиентского бота (у бота поддержки — своя). */
export const CABINET_TELEGRAM_WEBHOOK_PURPOSE = 'cabinet';

/** Имя бота, узнанное у Telegram для конкретного токена. */
interface UsernameCache {
    /** Отпечаток токена (не сам токен). */
    tokenKey: string;
    value: string | null;
    at: number;
}

/**
 * Клиентский Telegram-бот April (@AprilReportBot: отчёты и уведомления
 * клиентам; отдельный от бота поддержки и бота тревог). Единственная
 * настройка — токен CABINET_TELEGRAM_BOT_TOKEN в админке («Настройки
 * приложения» → «Telegram-боты»); имя бота спрашиваем у Telegram (getMe),
 * секрет вебхука вычисляем из токена. Нет токена — бот выключен.
 */
@Injectable()
export class ClientTelegramBotClient {
    private readonly logger = new Logger(ClientTelegramBotClient.name);
    private readonly reader: VendorSettingsReader;
    private readonly transport: TelegramBotApiTransport;
    private username: UsernameCache | null = null;

    constructor(
        http: HttpService,
        egress: EgressProxyService,
        config: ConfigService,
        @Optional()
        @Inject(VENDOR_SETTINGS_READER)
        reader?: VendorSettingsReader,
    ) {
        this.transport = { http, egress };
        this.reader = reader ?? envOnlyReader(key => config.get<string>(key));
    }

    async isConfigured(): Promise<boolean> {
        return Boolean(await this.token());
    }

    /** Секрет вебхука для текущего токена; null — токена нет. */
    async webhookSecret(): Promise<string | null> {
        const token = await this.token();
        return token
            ? telegramWebhookSecret(token, CABINET_TELEGRAM_WEBHOOK_PURPOSE)
            : null;
    }

    /**
     * Имя бота без @ — для ссылки t.me. Берётся у Telegram (getMe) и
     * запоминается до смены токена; null — токена нет или Telegram не ответил
     * (тогда код привязки вводят вручную: «/start КОД»).
     */
    async botUsername(): Promise<string | null> {
        const token = await this.token();
        if (!token) return null;
        const tokenKey = telegramWebhookSecret(
            token,
            CABINET_TELEGRAM_WEBHOOK_PURPOSE,
        );
        const cached = this.username;
        if (
            cached?.tokenKey === tokenKey &&
            (cached.value !== null ||
                Date.now() - cached.at < USERNAME_RETRY_MS)
        ) {
            return cached.value;
        }
        let value: string | null = null;
        try {
            value = await fetchTelegramBotUsername(this.transport, token);
        } catch (error) {
            this.logger.warn(
                `Клиентский бот: имя не получено: ${errorText(error)}`,
            );
        }
        this.username = { tokenKey, value, at: Date.now() };
        return value;
    }

    /** @returns true — Telegram принял сообщение */
    async sendMessage(chatId: bigint | number, html: string): Promise<boolean> {
        try {
            await this.call('sendMessage', {
                chat_id: chatId.toString(),
                text: html.slice(0, TELEGRAM_MAX_TEXT),
                parse_mode: 'HTML',
                disable_web_page_preview: true,
            });
            return true;
        } catch (error) {
            this.logger.warn(
                `Клиентский бот: сообщение в чат ${chatId.toString()} не отправлено: ${errorText(error)}`,
            );
            return false;
        }
    }

    /** Регистрация вебхука. @throws ошибка Telegram или нет токена */
    async setWebhook(url: string, secretToken: string): Promise<void> {
        await this.call('setWebhook', {
            url,
            secret_token: secretToken,
            allowed_updates: ['message'],
        });
    }

    private async call(
        method: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const token = await this.token();
        if (!token) {
            throw new Error(
                `не задан ${CABINET_TELEGRAM_SETTING_KEYS.botToken}`,
            );
        }
        await callTelegramBotApi(this.transport, token, method, payload);
    }

    private async token(): Promise<string | null> {
        return this.reader.get(CABINET_TELEGRAM_SETTING_KEYS.botToken);
    }
}

function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
