import { Module } from '@nestjs/common';
import { BxImBotChatService } from './services/bx-imbot-chat.service';
import { BxImBotChatBatchService } from './services/bx-imbot-chat.batch.service';

@Module({
    exports: [BxImBotChatService, BxImBotChatBatchService],
})
export class BitrixImBotChatDomainModule {}
