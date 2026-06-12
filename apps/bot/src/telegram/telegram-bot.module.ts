import { Module } from '@nestjs/common';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramBotService } from './telegram-bot.service';

/**
 * Feature-модуль канала Telegram-бота (шаблон).
 */
@Module({
    controllers: [TelegramBotController],
    providers: [TelegramBotService],
    exports: [TelegramBotService],
})
export class TelegramBotModule {}
