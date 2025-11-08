import { Module } from '@nestjs/common';
import { BxRecentService } from './services/bx-recent.service';
import { BxRecentBatchService } from './services/bx-recent.batch.service';

@Module({
    exports: [BxRecentService, BxRecentBatchService],
})
export class BitrixRecentDomainModule { }

