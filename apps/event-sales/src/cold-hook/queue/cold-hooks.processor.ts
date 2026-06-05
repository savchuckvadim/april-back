import { Injectable, Logger } from '@nestjs/common';
import {
    OnQueueActive,
    OnQueueCompleted,
    OnQueueError,
    OnQueueFailed,
    Process,
    Processor,
} from '@nestjs/bull';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { IColdHookSilenceHandlerData } from '../type/cold-hook-silence.interface';
import { Job } from 'bull';
import { ColdHooksHandlerService } from '../services/silence/cold-hooks-handler.service';

@Injectable()
@Processor(QueueNames.EVENT_SALES_COLD_CALL)
export class ColdHooksProcessor {
    private readonly logger = new Logger(ColdHooksProcessor.name);
    constructor(private readonly hooksService: ColdHooksHandlerService) {
        this.logger.log('ColdHooksProcessor initialized');
    }

    @Process(JobNames.EVENT_COLD_CALL)
    async handle(job: Job<IColdHookSilenceHandlerData>) {
        const { collected, payload } = job.data;
        const waitedMs = Date.now() - job.timestamp;
        this.logger.log(`EVENT_COLD_CALL jobId=${job.id} waitedMs=${waitedMs}`);
        await this.hooksService.handleHooks(payload.domain, collected);
    }

    @OnQueueActive()
    onActive(job: Job) {
        this.logger.log(`[queue active] jobId=${job.id} name=${job.name}`);
    }

    @OnQueueCompleted()
    onCompleted(job: Job) {
        this.logger.log(`[queue completed] jobId=${job.id} name=${job.name}`);
    }

    @OnQueueFailed()
    onFailed(job: Job, err: Error) {
        this.logger.error(
            `[queue failed] jobId=${job.id} name=${job.name} err=${err.message}`,
        );
    }

    @OnQueueError()
    onError(error: Error) {
        this.logger.error(`[queue error] ${error.message}`, error.stack);
    }
}
