import { Module } from '@nestjs/common';
import { SupportAssistantModule } from '../assistant/support-assistant.module';
import { SupportMonitorModule } from '../monitor/support-monitor.module';
import { SupportTelegramBotService } from './application/support-telegram-bot.service';

/**
 * Telegram-бот поддержки — ТОЛЬКО сервис обработки обновлений. Вебхук
 * (контроллер, секрет, регистрация) — в приложении bot
 * (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [SupportAssistantModule, SupportMonitorModule],
    providers: [SupportTelegramBotService],
    exports: [SupportTelegramBotService],
})
export class SupportTelegramBotModule {}
