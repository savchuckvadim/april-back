import { Module } from '@nestjs/common';
import { BxImBotV2BotService } from './services/bx-imbot-v2-bot.service';
import { BxImBotV2BotBatchService } from './services/bx-imbot-v2-bot.batch.service';

@Module({
    exports: [BxImBotV2BotService, BxImBotV2BotBatchService],
})
export class BitrixImBotV2BotDomainModule {}
