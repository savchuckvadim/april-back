import { Module } from '@nestjs/common';
import { BxImBotService } from './services/bx-imbot-bot.service';
import { BxImBotBatchService } from './services/bx-imbot-bot.batch.service';

@Module({
    exports: [BxImBotService, BxImBotBatchService],
})
export class BitrixImBotDomainModule {}
