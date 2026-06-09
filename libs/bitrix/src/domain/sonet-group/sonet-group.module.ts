import { Module } from '@nestjs/common';
import { BxSonetGroupService } from './services/sonet-group.service';
import { BxSonetGroupBatchService } from './services/sonet-group.batch.service';

@Module({
    providers: [BxSonetGroupService, BxSonetGroupBatchService],
    exports: [BxSonetGroupService, BxSonetGroupBatchService],
})
export class BxSonetGroupModule {}
