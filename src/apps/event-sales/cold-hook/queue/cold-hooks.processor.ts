import { Injectable, Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
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
        this.logger.log('EVENT_COLD_CALL');

        await this.hooksService.handleHooks(payload.domain, collected);
    }
}
