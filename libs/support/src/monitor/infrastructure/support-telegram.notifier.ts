import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/** Токен отдельного бота поддержки (BotFather), не общий бот тревог. */
export const SUPPORT_TELEGRAM_BOT_TOKEN_ENV = 'SUPPORT_TELEGRAM_BOT_TOKEN';
/** Чат поддержки: все его участники получают клиентские сигналы. */
export const SUPPORT_TELEGRAM_CHAT_ID_ENV = 'SUPPORT_TELEGRAM_CHAT_ID';

/** Лимит Telegram на длину сообщения. */
const TELEGRAM_MAX_TEXT = 4096;

/**
 * Оповещения в Telegram-чат поддержки (решение владельца 26.10.2026:
 * отдельный бот и чат, а не личный чат и не бот тревог разработчика).
 *
 * Бот и чат задаются в env приложения; не заданы — канал выключен и
 * оповещения уходят только в колокольчик. Ошибка Telegram не роняет такт:
 * возвращается false, решение «запомнить или повторить» — у вызывающего.
 */
@Injectable()
export class SupportTelegramNotifier {
    private readonly logger = new Logger(SupportTelegramNotifier.name);

    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService,
    ) {}

    isConfigured(): boolean {
        return Boolean(this.token() && this.chatId());
    }

    /** @returns true — сообщение принято Telegram. */
    async send(html: string): Promise<boolean> {
        const token = this.token();
        const chatId = this.chatId();
        if (!token || !chatId) return false;
        try {
            await firstValueFrom(
                this.http.post(
                    `https://api.telegram.org/bot${token}/sendMessage`,
                    {
                        chat_id: chatId,
                        text: html.slice(0, TELEGRAM_MAX_TEXT),
                        parse_mode: 'HTML',
                        disable_web_page_preview: true,
                    },
                    { timeout: 15_000 },
                ),
            );
            return true;
        } catch (error) {
            // Токен в URL — в лог только текст ошибки, без запроса.
            this.logger.warn(
                `Telegram-чат поддержки: сообщение не отправлено: ${(error as Error).message}`,
            );
            return false;
        }
    }

    private token(): string {
        return (
            this.config.get<string>(SUPPORT_TELEGRAM_BOT_TOKEN_ENV) ?? ''
        ).trim();
    }

    private chatId(): string {
        return (
            this.config.get<string>(SUPPORT_TELEGRAM_CHAT_ID_ENV) ?? ''
        ).trim();
    }
}
