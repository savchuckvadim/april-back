import { Injectable, Logger } from '@nestjs/common';
import { TelegramWebhookRegistrarBase } from '@lib/telegram';
import { CabinetConfig } from '../../config/cabinet.config';
import { CABINET_ENV } from '../../domain/cabinet.constants';
import { ClientTelegramBotClient } from '../client-telegram-bot.client';

/**
 * Вебхук клиентского бота (приложение bot): адрес — CABINET_TELEGRAM_WEBHOOK_URL
 * корневого .env, секрет — из токена. Смена токена в админке подхватывается
 * в течение пары минут (см. TelegramWebhookRegistrarBase).
 */
@Injectable()
export class ClientTelegramWebhookRegistrar extends TelegramWebhookRegistrarBase {
    protected readonly logger = new Logger(ClientTelegramWebhookRegistrar.name);
    protected readonly botName = 'Клиентский Telegram-бот';
    protected readonly urlEnvName = CABINET_ENV.telegramWebhookUrl;
    protected readonly noUrlEffect =
        'бот не получает сообщения, привязка чатов не работает';

    constructor(
        private readonly config: CabinetConfig,
        private readonly bot: ClientTelegramBotClient,
    ) {
        super();
    }

    protected webhookUrl(): string {
        return this.config.telegramWebhookUrl();
    }

    protected webhookSecret(): Promise<string | null> {
        return this.bot.webhookSecret();
    }

    protected setWebhook(url: string, secret: string): Promise<void> {
        return this.bot.setWebhook(url, secret);
    }
}
