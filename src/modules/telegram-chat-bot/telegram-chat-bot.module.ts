import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramChatBotService } from './telegram-chat-bot.service';

@Module({
    imports: [ConfigModule],
    providers: [TelegramChatBotService],
    exports: [TelegramChatBotService],
})
export class TelegramChatBotModule {}
