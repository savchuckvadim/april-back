import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { EgressProxyService } from '@lib/egress-proxy';
import {
    callTelegramBotApi,
    fetchTelegramBotUsername,
    TelegramBotApiTransport,
} from '@lib/telegram';
import {
    TELEGRAM_BOTS,
    TelegramBotEntry,
    TelegramBotKey,
    TelegramBotPlace,
    TelegramBotsCatalog,
} from './telegram-bots.catalog';

export {
    TELEGRAM_BOT_KEYS,
    TELEGRAM_BOT_PLACES,
    type TelegramBotKey,
    type TelegramBotPlace,
} from './telegram-bots.catalog';

/** Итог проверки: бот найден, токена нет, Telegram не узнал токен. */
export const TELEGRAM_BOT_CHECK_STATUSES = ['ok', 'not-set', 'error'] as const;
export type TelegramBotCheckStatus =
    (typeof TELEGRAM_BOT_CHECK_STATUSES)[number];

/** Вебхук бота по ответу Telegram (getWebhookInfo). */
export interface TelegramBotWebhook {
    /** Куда Telegram шлёт сообщения; null — вебхук не установлен. */
    url: string | null;
    /** Сколько сообщений ждут доставки на наш сервер. */
    pending: number;
    lastError: string | null;
    lastErrorAt: string | null;
}

export interface TelegramBotCheck {
    key: TelegramBotKey;
    title: string;
    place: TelegramBotPlace;
    status: TelegramBotCheckStatus;
    /** Имя бота без @ по ответу Telegram. */
    username: string | null;
    error: string | null;
    /** Названия других ботов с тем же токеном — ошибка конфигурации. */
    sameTokenAs: string[];
    /** null — бот только отправляет (тревоги) или Telegram не ответил. */
    webhook: TelegramBotWebhook | null;
    /** Есть общий чат для тестового сообщения (поддержка, тревоги). */
    canTest: boolean;
}

interface TelegramWebhookInfo {
    url?: string;
    pending_update_count?: number;
    last_error_message?: string;
    last_error_date?: number;
}

/**
 * «Кто есть кто» среди Telegram-ботов April: какой бот на самом деле стоит
 * в каждом токене (getMe), не вставлен ли один токен в два места и
 * доходят ли до нас сообщения (getWebhookInfo). Токены наружу не отдаются.
 */
@Injectable()
export class VendorTelegramBotsService {
    private readonly transport: TelegramBotApiTransport;

    constructor(
        http: HttpService,
        egress: EgressProxyService,
        private readonly catalog: TelegramBotsCatalog,
    ) {
        this.transport = { http, egress };
    }

    async check(): Promise<TelegramBotCheck[]> {
        const tokens = await Promise.all(
            TELEGRAM_BOTS.map(bot => this.catalog.token(bot)),
        );
        return Promise.all(
            TELEGRAM_BOTS.map(async (bot, index) => {
                const token = tokens[index];
                const sameTokenAs = token
                    ? TELEGRAM_BOTS.filter(
                          (_, i) => i !== index && tokens[i] === token,
                      ).map(other => other.title)
                    : [];
                const [identity, webhook] = await Promise.all([
                    this.identify(token),
                    this.webhook(bot, token),
                ]);
                return {
                    key: bot.key,
                    title: bot.title,
                    place: bot.place,
                    sameTokenAs,
                    webhook,
                    canTest: bot.testChat !== null,
                    ...identity,
                };
            }),
        );
    }

    private async identify(
        token: string | null,
    ): Promise<Pick<TelegramBotCheck, 'status' | 'username' | 'error'>> {
        if (!token) return { status: 'not-set', username: null, error: null };
        try {
            const username = await fetchTelegramBotUsername(
                this.transport,
                token,
            );
            return { status: 'ok', username, error: null };
        } catch (error) {
            return { status: 'error', username: null, error: describe(error) };
        }
    }

    private async webhook(
        bot: TelegramBotEntry,
        token: string | null,
    ): Promise<TelegramBotWebhook | null> {
        if (!bot.hasWebhook || !token) return null;
        try {
            const info = await callTelegramBotApi<TelegramWebhookInfo>(
                this.transport,
                token,
                'getWebhookInfo',
                {},
            );
            return {
                url: info?.url || null,
                pending: info?.pending_update_count ?? 0,
                lastError: info?.last_error_message ?? null,
                lastErrorAt: info?.last_error_date
                    ? new Date(info.last_error_date * 1000).toISOString()
                    : null,
            };
        } catch {
            return null;
        }
    }
}

/** Текст для администратора: неверный токен — отдельно от сети. */
export function describe(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return /unauthorized|not found/i.test(message)
        ? 'Telegram не узнал токен — неверный или отозван'
        : `Не удалось проверить: ${message}`;
}
