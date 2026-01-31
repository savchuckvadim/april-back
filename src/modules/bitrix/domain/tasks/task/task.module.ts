import { Module } from '@nestjs/common';
import { BxTaskService } from './services/task.service';
import { BxTaskBatchService } from './services/task.batch.service';

@Module({
    providers: [BxTaskService, BxTaskBatchService],
    exports: [BxTaskService, BxTaskBatchService],
})
export class BxTaskModule { }
