import { Module } from '@nestjs/common';
import { BitrixBotController } from './bitrix-bot.controller';
import { BitrixBotService } from './bitrix-bot.service';

/**
 * Feature-модуль канала Bitrix-бота (шаблон).
 */
@Module({
    controllers: [BitrixBotController],
    providers: [BitrixBotService],
    exports: [BitrixBotService],
})
export class BitrixBotModule {}
