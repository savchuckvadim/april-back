import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupportMonitorModule, SupportTelegramBotModule } from '@lib/support';
import { SupportTelegramWebhookGuard } from './guards/support-telegram-webhook.guard';
import { SupportTelegramController } from './support-telegram.controller';
import { SupportTelegramWebhookRegistrar } from './support-telegram-webhook.registrar';

/**
 * Telegram-вход к ИИ-помощнику в приложении bot: вебхук, его секрет и
 * регистрация в Telegram. Обработка команд — в @lib/support
 * (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [ConfigModule, SupportTelegramBotModule, SupportMonitorModule],
    controllers: [SupportTelegramController],
    providers: [SupportTelegramWebhookGuard, SupportTelegramWebhookRegistrar],
})
export class SupportTelegramAppModule {}
