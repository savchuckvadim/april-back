import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    TELEGRAM_ALERTS_BOT_TOKEN_ENV,
    TELEGRAM_ALERTS_CHAT_ID_ENV,
} from '@lib/telegram';
import {
    TELEGRAM_BOT_TOKEN_SETTING_KEYS,
    VENDOR_SETTINGS_READER,
    VendorSettingKey,
    VendorSettingsReader,
} from '@lib/vendor-settings';

/** Где задаётся токен бота: настройки админки или только окружение сервера. */
export const TELEGRAM_BOT_PLACES = ['admin', 'env'] as const;
export type TelegramBotPlace = (typeof TELEGRAM_BOT_PLACES)[number];

/** Токены ботов: настройки админки + env бота тревог. */
export const TELEGRAM_BOT_KEYS = [
    ...TELEGRAM_BOT_TOKEN_SETTING_KEYS,
    TELEGRAM_ALERTS_BOT_TOKEN_ENV,
] as const;
export type TelegramBotKey = (typeof TELEGRAM_BOT_KEYS)[number];

export function isTelegramBotKey(value: string): value is TelegramBotKey {
    return (TELEGRAM_BOT_KEYS as readonly string[]).includes(value);
}

/** Чат поддержки — настройка админки (как и токен бота поддержки). */
const SUPPORT_CHAT_KEY: VendorSettingKey = 'SUPPORT_TELEGRAM_CHAT_ID';

export interface TelegramBotEntry {
    key: TelegramBotKey;
    title: string;
    place: TelegramBotPlace;
    /** Бот принимает сообщения вебхуком (тревоги — только отправляет). */
    hasWebhook: boolean;
    /** Откуда взять чат для тестового сообщения; null — общего чата нет. */
    testChat: { place: TelegramBotPlace; key: string } | null;
}

/** Все боты April — в порядке показа. */
export const TELEGRAM_BOTS: readonly TelegramBotEntry[] = [
    {
        key: 'CABINET_TELEGRAM_BOT_TOKEN',
        title: 'Клиентский (отчёты и уведомления клиентам)',
        place: 'admin',
        hasWebhook: true,
        testChat: null,
    },
    {
        key: 'SUPPORT_TELEGRAM_BOT_TOKEN',
        title: 'Поддержка (сотрудникам April)',
        place: 'admin',
        hasWebhook: true,
        testChat: { place: 'admin', key: SUPPORT_CHAT_KEY },
    },
    {
        key: TELEGRAM_ALERTS_BOT_TOKEN_ENV,
        title: 'Тревоги разработчика',
        place: 'env',
        hasWebhook: false,
        testChat: { place: 'env', key: TELEGRAM_ALERTS_CHAT_ID_ENV },
    },
];

/**
 * Токены и чаты ботов: из настроек админки (бот поддержки, клиентский) или
 * окружения admin (бот тревог — корневой .env). Наружу не отдаются.
 */
@Injectable()
export class TelegramBotsCatalog {
    constructor(
        private readonly config: ConfigService,
        @Inject(VENDOR_SETTINGS_READER)
        private readonly reader: VendorSettingsReader,
    ) {}

    entry(key: TelegramBotKey): TelegramBotEntry {
        const found = TELEGRAM_BOTS.find(bot => bot.key === key);
        if (!found) throw new Error(`Нет описания бота ${key}`);
        return found;
    }

    token(bot: TelegramBotEntry): Promise<string | null> {
        return this.read(bot.place, bot.key);
    }

    testChatId(bot: TelegramBotEntry): Promise<string | null> {
        return bot.testChat
            ? this.read(bot.testChat.place, bot.testChat.key)
            : Promise.resolve(null);
    }

    private async read(
        place: TelegramBotPlace,
        key: string,
    ): Promise<string | null> {
        const raw =
            place === 'env'
                ? this.config.get<string>(key)
                : await this.reader.get(key);
        return raw?.trim() || null;
    }
}
