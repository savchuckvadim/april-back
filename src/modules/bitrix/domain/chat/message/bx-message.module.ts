import { Module } from '@nestjs/common';
import { BxMessageService } from './services/bx-message.service';
import { BxMessageBatchService } from './services/bx-message.batch.service';

@Module({
    exports: [BxMessageService, BxMessageBatchService],
})
export class BitrixMessageDomainModule { }

