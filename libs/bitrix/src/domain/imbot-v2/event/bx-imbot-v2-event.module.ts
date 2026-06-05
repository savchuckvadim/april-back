import { Module } from '@nestjs/common';
import { BxImBotV2EventService } from './services/bx-imbot-v2-event.service';
import { BxImBotV2EventBatchService } from './services/bx-imbot-v2-event.batch.service';

@Module({
    exports: [BxImBotV2EventService, BxImBotV2EventBatchService],
})
export class BitrixImBotV2EventDomainModule {}
