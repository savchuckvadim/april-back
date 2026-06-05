import { Module } from '@nestjs/common';
import { BxImBotV2ChatService } from './services/bx-imbot-v2-chat.service';
import { BxImBotV2ChatBatchService } from './services/bx-imbot-v2-chat.batch.service';

@Module({
    exports: [BxImBotV2ChatService, BxImBotV2ChatBatchService],
})
export class BitrixImBotV2ChatDomainModule {}
