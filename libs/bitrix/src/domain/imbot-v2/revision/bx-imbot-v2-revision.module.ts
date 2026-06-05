import { Module } from '@nestjs/common';
import { BxImBotV2RevisionService } from './services/bx-imbot-v2-revision.service';
import { BxImBotV2RevisionBatchService } from './services/bx-imbot-v2-revision.batch.service';

@Module({
    exports: [BxImBotV2RevisionService, BxImBotV2RevisionBatchService],
})
export class BitrixImBotV2RevisionDomainModule {}
