import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupportTelegramNotifier } from '@lib/support';
import { TelegramWebhookRegistrarBase } from '@lib/telegram';

/** Полный публичный адрес вебхука: `https://api.bot.april-app.ru/api/support/telegram/webhook`. */
export const SUPPORT_TELEGRAM_WEBHOOK_URL_ENV = 'SUPPORT_TELEGRAM_WEBHOOK_URL';

/**
 * Вебхук бота поддержки: адрес — env этого сервера, секрет — из токена.
 * Смена токена в админке (например, после утечки) подхватывается в течение
 * пары минут без перезапуска (см. TelegramWebhookRegistrarBase).
 */
@Injectable()
export class SupportTelegramWebhookRegistrar extends TelegramWebhookRegistrarBase {
    protected readonly logger = new Logger(
        SupportTelegramWebhookRegistrar.name,
    );
    protected readonly botName = 'Telegram-бот поддержки';
    protected readonly urlEnvName = SUPPORT_TELEGRAM_WEBHOOK_URL_ENV;
    protected readonly noUrlEffect =
        'бот шлёт оповещения, но команды не принимает';

    constructor(
        private readonly config: ConfigService,
        private readonly telegram: SupportTelegramNotifier,
    ) {
        super();
    }

    protected webhookUrl(): string {
        return (
            this.config.get<string>(SUPPORT_TELEGRAM_WEBHOOK_URL_ENV) ?? ''
        ).trim();
    }

    protected webhookSecret(): Promise<string | null> {
        return this.telegram.webhookSecret();
    }

    protected setWebhook(url: string, secret: string): Promise<void> {
        return this.telegram.setWebhook(url, secret);
    }
}
