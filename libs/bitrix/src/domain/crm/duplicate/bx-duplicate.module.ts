import { Module } from '@nestjs/common';
import { BxDuplicateService } from './services/bx-duplicate.service';
import { BxDuplicateBatchService } from './services/bx-duplicate.batch.service';

/** crm.duplicate.* (findbycomm). */
@Module({
    providers: [BxDuplicateService, BxDuplicateBatchService],
    exports: [BxDuplicateService, BxDuplicateBatchService],
})
export class BitrixDuplicateDomainModule {}
