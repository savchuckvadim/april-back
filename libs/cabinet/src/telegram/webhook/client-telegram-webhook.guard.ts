import { Injectable } from '@nestjs/common';
import { TelegramWebhookGuardBase } from '@lib/telegram';
import { ClientTelegramBotClient } from '../client-telegram-bot.client';

/** Вебхук клиентского бота: секрет вычисляется из токена в админке. */
@Injectable()
export class ClientTelegramWebhookGuard extends TelegramWebhookGuardBase {
    protected readonly botNameGenitive = 'клиентского Telegram-бота';

    constructor(private readonly bot: ClientTelegramBotClient) {
        super();
    }

    protected expectedSecret(): Promise<string | null> {
        return this.bot.webhookSecret();
    }
}
