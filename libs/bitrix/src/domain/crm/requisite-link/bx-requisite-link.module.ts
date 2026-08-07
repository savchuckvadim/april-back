import { Module } from '@nestjs/common';
import { BxRequisiteLinkService } from './services/bx-requisite-link.service';
import { BxRequisiteLinkBatchService } from './services/bx-requisite-link.batch.service';

/** crm.requisite.link.* — связь реквизитов с объектами CRM. */
@Module({
    providers: [BxRequisiteLinkService, BxRequisiteLinkBatchService],
    exports: [BxRequisiteLinkService, BxRequisiteLinkBatchService],
})
export class BitrixRequisiteLinkDomainModule {}
