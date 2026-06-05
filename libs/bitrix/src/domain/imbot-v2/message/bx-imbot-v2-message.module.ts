import { Module } from '@nestjs/common';
import { BxImBotV2MessageService } from './services/bx-imbot-v2-message.service';
import { BxImBotV2MessageBatchService } from './services/bx-imbot-v2-message.batch.service';

@Module({
    exports: [BxImBotV2MessageService, BxImBotV2MessageBatchService],
})
export class BitrixImBotV2MessageDomainModule {}
