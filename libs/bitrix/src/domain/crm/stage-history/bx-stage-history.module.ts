import { Module } from '@nestjs/common';
import { BxStageHistoryService } from './services/bx-stage-history.service';
import { BxStageHistoryBatchService } from './services/bx-stage-history.batch.service';

@Module({
    providers: [BxStageHistoryService, BxStageHistoryBatchService],
    exports: [BxStageHistoryService, BxStageHistoryBatchService],
})
export class BitrixStageHistoryDomainModule {}
