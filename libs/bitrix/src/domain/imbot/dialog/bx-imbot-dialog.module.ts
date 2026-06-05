import { Module } from '@nestjs/common';
import { BxImBotDialogService } from './services/bx-imbot-dialog.service';
import { BxImBotDialogBatchService } from './services/bx-imbot-dialog.batch.service';

@Module({
    exports: [BxImBotDialogService, BxImBotDialogBatchService],
})
export class BitrixImBotDialogDomainModule {}
