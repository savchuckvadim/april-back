import { Injectable } from '@nestjs/common';
import { SupportTelegramNotifier } from '@lib/support';
import { TelegramWebhookGuardBase } from '@lib/telegram';

/**
 * Вебхук бота поддержки принимает только запросы с секретом, который bot
 * сам передал Telegram при регистрации; секрет вычисляется из токена бота
 * (админка или env). Токена нет — вебхук закрыт.
 */
@Injectable()
export class SupportTelegramWebhookGuard extends TelegramWebhookGuardBase {
    protected readonly botNameGenitive = 'Telegram-бота поддержки';

    constructor(private readonly telegram: SupportTelegramNotifier) {
        super();
    }

    protected expectedSecret(): Promise<string | null> {
        return this.telegram.webhookSecret();
    }
}
