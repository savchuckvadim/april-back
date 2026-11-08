import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EgressProxyService } from '@lib/egress-proxy';
import {
    fetchTelegramBotUsername,
    TELEGRAM_ALERTS_BOT_TOKEN_ENV,
    TelegramBotApiTransport,
} from '@lib/telegram';
import {
    TELEGRAM_BOT_TOKEN_SETTING_KEYS,
    VENDOR_SETTINGS_READER,
    VendorSettingsReader,
} from '@lib/vendor-settings';

/** Где задаётся токен бота: настройки админки или только окружение сервера. */
export const TELEGRAM_BOT_PLACES = ['admin', 'env'] as const;
export type TelegramBotPlace = (typeof TELEGRAM_BOT_PLACES)[number];

/** Итог проверки: бот найден, токена нет, Telegram не узнал токен. */
export const TELEGRAM_BOT_CHECK_STATUSES = ['ok', 'not-set', 'error'] as const;
export type TelegramBotCheckStatus =
    (typeof TELEGRAM_BOT_CHECK_STATUSES)[number];

/** Токены ботов: настройки админки + env бота тревог. */
export const TELEGRAM_BOT_KEYS = [
    ...TELEGRAM_BOT_TOKEN_SETTING_KEYS,
    TELEGRAM_ALERTS_BOT_TOKEN_ENV,
] as const;
export type TelegramBotKey = (typeof TELEGRAM_BOT_KEYS)[number];

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
}

interface BotEntry {
    key: TelegramBotKey;
    title: string;
    place: TelegramBotPlace;
}

/** Все боты April — в порядке показа. */
const BOTS: readonly BotEntry[] = [
    {
        key: 'CABINET_TELEGRAM_BOT_TOKEN',
        title: 'Клиентский (отчёты и уведомления клиентам)',
        place: 'admin',
    },
    {
        key: 'SUPPORT_TELEGRAM_BOT_TOKEN',
        title: 'Поддержка (сотрудникам April)',
        place: 'admin',
    },
    {
        key: TELEGRAM_ALERTS_BOT_TOKEN_ENV,
        title: 'Тревоги разработчика',
        place: 'env',
    },
];

/**
 * «Кто есть кто» среди Telegram-ботов April: какой бот на самом деле стоит
 * в каждом токене (getMe) и не вставлен ли один токен в два места. Токены
 * наружу не отдаются. Бот тревог читается из окружения admin (корневой .env).
 */
@Injectable()
export class VendorTelegramBotsService {
    private readonly transport: TelegramBotApiTransport;

    constructor(
        http: HttpService,
        egress: EgressProxyService,
        private readonly config: ConfigService,
        @Inject(VENDOR_SETTINGS_READER)
        private readonly reader: VendorSettingsReader,
    ) {
        this.transport = { http, egress };
    }

    async check(): Promise<TelegramBotCheck[]> {
        const tokens = await Promise.all(BOTS.map(bot => this.tokenOf(bot)));
        return Promise.all(
            BOTS.map(async (bot, index) => {
                const token = tokens[index];
                const sameTokenAs = token
                    ? BOTS.filter(
                          (_, i) => i !== index && tokens[i] === token,
                      ).map(other => other.title)
                    : [];
                return { ...bot, sameTokenAs, ...(await this.identify(token)) };
            }),
        );
    }

    private async tokenOf(bot: BotEntry): Promise<string | null> {
        const raw =
            bot.place === 'env'
                ? this.config.get<string>(bot.key)
                : await this.reader.get(bot.key);
        return raw?.trim() || null;
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
            return {
                status: 'error',
                username: null,
                error: describe(error),
            };
        }
    }
}

/** Текст для администратора: неверный токен — отдельно от сети. */
function describe(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return /unauthorized|not found/i.test(message)
        ? 'Telegram не узнал токен — неверный или отозван'
        : `Не удалось проверить: ${message}`;
}
