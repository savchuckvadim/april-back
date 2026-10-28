import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    APP_ROLE_ENV,
    AppRole,
    resolveAppRole,
} from '@lib/core/bootstrap/app-role';
import { SupportTelegramNotifier } from '@lib/support';
import { SUPPORT_TELEGRAM_WEBHOOK_SECRET_ENV } from './guards/support-telegram-webhook.guard';

/** Полный публичный адрес вебхука: `https://api.bot.april-app.ru/api/support/telegram/webhook`. */
export const SUPPORT_TELEGRAM_WEBHOOK_URL_ENV = 'SUPPORT_TELEGRAM_WEBHOOK_URL';

/**
 * Регистрация вебхука бота поддержки в Telegram при старте: адрес и секрет
 * — из env, менять их можно без кода. На зеркале (APP_ROLE=standby) не
 * трогаем: иначе резерв перетянул бы обновления на себя.
 */
@Injectable()
export class SupportTelegramWebhookRegistrar implements OnApplicationBootstrap {
    private readonly logger = new Logger(SupportTelegramWebhookRegistrar.name);

    constructor(
        private readonly config: ConfigService,
        private readonly telegram: SupportTelegramNotifier,
    ) {}

    onApplicationBootstrap(): void {
        // Без await: сеть Telegram не должна задерживать старт приложения.
        void this.register();
    }

    async register(): Promise<void> {
        if (resolveAppRole(process.env[APP_ROLE_ENV]) === AppRole.STANDBY) {
            this.logger.log(
                'Telegram-бот поддержки: режим ожидания — вебхук не регистрируем',
            );
            return;
        }
        if (!this.telegram.isConfigured()) return;
        const url = this.env(SUPPORT_TELEGRAM_WEBHOOK_URL_ENV);
        const secret = this.env(SUPPORT_TELEGRAM_WEBHOOK_SECRET_ENV);
        if (!url || !secret) {
            this.logger.warn(
                `Telegram-бот поддержки: ${SUPPORT_TELEGRAM_WEBHOOK_URL_ENV} и ${SUPPORT_TELEGRAM_WEBHOOK_SECRET_ENV} ` +
                    'не заданы — бот шлёт оповещения, но команды не принимает',
            );
            return;
        }
        try {
            await this.telegram.setWebhook(url, secret);
            this.logger.log(
                `Telegram-бот поддержки: вебхук установлен: ${url}`,
            );
        } catch (error) {
            this.logger.error(
                `Telegram-бот поддержки: вебхук не установлен: ${(error as Error).message}`,
            );
        }
    }

    private env(name: string): string {
        return (this.config.get<string>(name) ?? '').trim();
    }
}
