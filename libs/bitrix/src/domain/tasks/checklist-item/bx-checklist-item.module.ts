import { Module } from '@nestjs/common';
import { BxChecklistItemService } from './services/bx-checklist-item.service';
import { BxChecklistItemBatchService } from './services/bx-checklist-item.batch.service';

@Module({
    providers: [BxChecklistItemService, BxChecklistItemBatchService],
    exports: [BxChecklistItemService, BxChecklistItemBatchService],
})
export class BxChecklistItemModule {}
