import { Module } from '@nestjs/common';
import { BxImV2ChatMessageService } from './services/bx-im-v2-chat-message.service';
import { BxImV2ChatMessageBatchService } from './services/bx-im-v2-chat-message.batch.service';

@Module({
    exports: [BxImV2ChatMessageService, BxImV2ChatMessageBatchService],
})
export class BitrixImV2ChatMessageDomainModule {}
