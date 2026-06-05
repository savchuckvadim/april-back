import { Module } from '@nestjs/common';
import { BxImBotMessageService } from './services/bx-imbot-message.service';
import { BxImBotMessageBatchService } from './services/bx-imbot-message.batch.service';

@Module({
    exports: [BxImBotMessageService, BxImBotMessageBatchService],
})
export class BitrixImBotMessageDomainModule {}
