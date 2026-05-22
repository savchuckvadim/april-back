import { Module } from '@nestjs/common';
import { BxImV2EventBatchService } from './services/bx-im-v2-event.batch.service';
import { BxImV2EventService } from './services/bx-im-v2-event.service';

@Module({
    exports: [BxImV2EventService, BxImV2EventBatchService],
})
export class BitrixImV2EventDomainModule {}
