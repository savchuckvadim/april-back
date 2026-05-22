import { Module } from '@nestjs/common';
import { BxDialogMessageBatchService } from './services/bx-dialog-message.batch.service';
import { BxDialogMessageService } from './services/bx-dialog-message.service';

@Module({
    exports: [BxDialogMessageService, BxDialogMessageBatchService],
})
export class BitrixDialogMessageDomainModule {}
