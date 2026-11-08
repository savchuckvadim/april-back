import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EgressProxyService } from '@lib/egress-proxy';
import {
    callTelegramBotApi,
    TELEGRAM_MAX_TEXT,
    TelegramBotApiTransport,
    telegramWebhookSecret,
} from '@lib/telegram';
import {
    envOnlyReader,
    VENDOR_SETTINGS_READER,
    VendorSettingsReader,
} from '@lib/vendor-settings';

/** Токен отдельного бота поддержки (BotFather), не общий бот тревог. */
export const SUPPORT_TELEGRAM_BOT_TOKEN_ENV = 'SUPPORT_TELEGRAM_BOT_TOKEN';
/** Чат поддержки: все его участники получают клиентские сигналы. */
export const SUPPORT_TELEGRAM_CHAT_ID_ENV = 'SUPPORT_TELEGRAM_CHAT_ID';
/** Соль секрета вебхука бота поддержки (у клиентского бота — своя). */
export const SUPPORT_TELEGRAM_WEBHOOK_PURPOSE = 'support';

/** Статусы getChatMember, при которых человек состоит в чате. */
const MEMBER_STATUSES = new Set([
    'creator',
    'administrator',
    'member',
    'restricted',
]);

/** Кнопка под сообщением: callback_data ≤ 64 байт. */
export interface TelegramInlineButton {
    text: string;
    callback_data: string;
}
export type TelegramInlineKeyboard = TelegramInlineButton[][];

export interface TelegramSendOptions {
    replyMarkup?: TelegramInlineKeyboard;
    replyToMessageId?: number;
}

/**
 * Бот поддержки в Telegram (решение владельца 26.10.2026: отдельный бот и
 * чат, а не личный чат и не бот тревог разработчика): оповещения в чат
 * поддержки и ответы ИИ-помощника с кнопками.
 *
 * Токен и чат — админка «Настройки приложения» → «Telegram-боты»
 * (SUPPORT_TELEGRAM_BOT_TOKEN, SUPPORT_TELEGRAM_CHAT_ID); не заданы там —
 * env с теми же именами; нигде — канал выключен, оповещения уходят только
 * в колокольчик. Смена токена в админке подхватывается без перезапуска.
 * Ошибка Telegram не роняет такт: `send` возвращает false, решение
 * «запомнить или повторить» — у вызывающего.
 */
@Injectable()
export class SupportTelegramNotifier {
    private readonly logger = new Logger(SupportTelegramNotifier.name);
    private readonly reader: VendorSettingsReader;
    private readonly transport: TelegramBotApiTransport;

    constructor(
        http: HttpService,
        config: ConfigService,
        /** api.telegram.org через исходящий прокси, если он настроен. */
        egress: EgressProxyService,
        @Optional()
        @Inject(VENDOR_SETTINGS_READER)
        reader?: VendorSettingsReader,
    ) {
        this.transport = { http, egress };
        this.reader = reader ?? envOnlyReader(key => config.get<string>(key));
    }

    async isConfigured(): Promise<boolean> {
        return Boolean((await this.token()) && (await this.chatId()));
    }

    /** Чат поддержки; '' — не задан. */
    supportChatId(): Promise<string> {
        return this.chatId();
    }

    /** Секрет вебхука для текущего токена; null — токена нет. */
    async webhookSecret(): Promise<string | null> {
        const token = await this.token();
        return token
            ? telegramWebhookSecret(token, SUPPORT_TELEGRAM_WEBHOOK_PURPOSE)
            : null;
    }

    /** Оповещение в чат поддержки. @returns true — сообщение принято Telegram. */
    async send(html: string): Promise<boolean> {
        const chatId = await this.chatId();
        if (!chatId || !(await this.token())) return false;
        return (await this.post(chatId, html)) !== null;
    }

    /**
     * Сообщение в любой чат (чат поддержки или личный чат с ботом), при
     * необходимости с кнопками. @returns message_id; null — не отправлено.
     */
    async sendTo(
        chatId: number | string,
        html: string,
        options: TelegramSendOptions = {},
    ): Promise<number | null> {
        return (await this.post(chatId, html, options))?.messageId ?? null;
    }

    /** sendMessage; принято — объект (message_id может не прийти), ошибка — null. */
    private async post(
        chatId: number | string,
        html: string,
        options: TelegramSendOptions = {},
    ): Promise<{ messageId: number | null } | null> {
        try {
            const message = await this.call<{ message_id?: number }>(
                'sendMessage',
                {
                    chat_id: chatId,
                    text: html.slice(0, TELEGRAM_MAX_TEXT),
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    ...(options.replyMarkup
                        ? {
                              reply_markup: {
                                  inline_keyboard: options.replyMarkup,
                              },
                          }
                        : {}),
                    ...(options.replyToMessageId
                        ? { reply_to_message_id: options.replyToMessageId }
                        : {}),
                },
            );
            return { messageId: message?.message_id ?? null };
        } catch (error) {
            this.logger.warn(
                `Telegram-бот поддержки: сообщение не отправлено: ${(error as Error).message}`,
            );
            return null;
        }
    }

    /** Всплывающий ответ на нажатие кнопки; без него Telegram крутит «часики». */
    async answerCallback(
        callbackQueryId: string,
        text?: string,
    ): Promise<void> {
        try {
            await this.call('answerCallbackQuery', {
                callback_query_id: callbackQueryId,
                ...(text ? { text } : {}),
            });
        } catch (error) {
            this.logger.warn(
                `Telegram-бот поддержки: ответ на кнопку не принят: ${(error as Error).message}`,
            );
        }
    }

    /** Снять кнопки с сообщения (черновик отправлен или убран). */
    async clearKeyboard(
        chatId: number | string,
        messageId: number,
    ): Promise<void> {
        try {
            await this.call('editMessageReplyMarkup', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard: [] },
            });
        } catch (error) {
            this.logger.warn(
                `Telegram-бот поддержки: кнопки не сняты: ${(error as Error).message}`,
            );
        }
    }

    /** Состоит ли человек в чате поддержки — пропуск в личный чат с ботом. */
    async isChatMember(userId: number): Promise<boolean> {
        const chatId = await this.chatId();
        if (!chatId) return false;
        try {
            const member = await this.call<{ status?: string }>(
                'getChatMember',
                { chat_id: chatId, user_id: userId },
            );
            return MEMBER_STATUSES.has(member?.status ?? '');
        } catch (error) {
            this.logger.warn(
                `Telegram-бот поддержки: членство в чате не проверено: ${(error as Error).message}`,
            );
            return false;
        }
    }

    /** Регистрация вебхука входящих обновлений. @throws ошибка Telegram. */
    async setWebhook(url: string, secretToken: string): Promise<void> {
        await this.call('setWebhook', {
            url,
            secret_token: secretToken,
            allowed_updates: ['message', 'callback_query'],
        });
    }

    /** Вызов метода Bot API; токен — только в адресе, в логи не попадает. */
    private async call<T = unknown>(
        method: string,
        payload: Record<string, unknown>,
    ): Promise<T | undefined> {
        const token = await this.token();
        if (!token) {
            throw new Error(`не задан ${SUPPORT_TELEGRAM_BOT_TOKEN_ENV}`);
        }
        return callTelegramBotApi<T>(this.transport, token, method, payload);
    }

    private async token(): Promise<string> {
        return (await this.reader.get(SUPPORT_TELEGRAM_BOT_TOKEN_ENV)) ?? '';
    }

    private async chatId(): Promise<string> {
        return (await this.reader.get(SUPPORT_TELEGRAM_CHAT_ID_ENV)) ?? '';
    }
}
