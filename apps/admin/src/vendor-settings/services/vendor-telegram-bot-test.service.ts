import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { EgressProxyService } from '@lib/egress-proxy';
import { callTelegramBotApi, TelegramBotApiTransport } from '@lib/telegram';
import { TelegramBotKey, TelegramBotsCatalog } from './telegram-bots.catalog';

/** Итог тестового сообщения — по-русски. */
export interface TelegramBotTestResult {
    ok: boolean;
    message: string;
}

/** Частые ответы Telegram → что с этим делать. */
const REASONS: ReadonlyArray<readonly [RegExp, string]> = [
    [/unauthorized/i, 'Telegram не узнал токен — неверный или отозван'],
    [
        /chat not found/i,
        'чат не найден: проверьте номер чата и что бот добавлен в этот чат',
    ],
    [
        /bot was kicked|not a member|bot is not a member/i,
        'бота удалили из чата — добавьте его обратно',
    ],
    [/blocked by the user/i, 'человек заблокировал бота'],
];

/**
 * Тестовое сообщение через бота: поддержка — в чат поддержки, тревоги — в
 * чат админа (TELEGRAM_ADMIN_CHAT_ID); можно указать свой chat id. У
 * клиентского бота общего чата нет — его проверяют у привязанного чата в
 * карточке портала (вкладка «Кабинет»).
 */
@Injectable()
export class VendorTelegramBotTestService {
    private readonly transport: TelegramBotApiTransport;

    constructor(
        http: HttpService,
        egress: EgressProxyService,
        private readonly catalog: TelegramBotsCatalog,
    ) {
        this.transport = { http, egress };
    }

    async send(
        key: TelegramBotKey,
        chatIdOverride?: string,
    ): Promise<TelegramBotTestResult> {
        const bot = this.catalog.entry(key);
        const token = await this.catalog.token(bot);
        if (!token) {
            return { ok: false, message: 'Токен бота не задан.' };
        }
        const chatId =
            chatIdOverride?.trim() || (await this.catalog.testChatId(bot));
        if (!chatId) {
            return {
                ok: false,
                message: bot.testChat
                    ? 'Не задан чат бота — заполните его в настройках.'
                    : 'У клиентского бота нет общего чата: проверьте его у привязанного чата в карточке портала (вкладка «Кабинет») или укажите chat id.',
            };
        }
        try {
            await callTelegramBotApi(this.transport, token, 'sendMessage', {
                chat_id: chatId,
                text: `✅ Проверка из админки April: бот «${bot.title}» работает.`,
            });
            return {
                ok: true,
                message: `Сообщение доставлено в чат ${chatId}.`,
            };
        } catch (error) {
            const text = error instanceof Error ? error.message : String(error);
            const reason = REASONS.find(([pattern]) => pattern.test(text));
            return {
                ok: false,
                message: `Не доставлено: ${reason ? reason[1] : text}`,
            };
        }
    }
}
