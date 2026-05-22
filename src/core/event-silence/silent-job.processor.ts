import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { EventSilentJobManagerService } from './silent-job-manager.service';
import { EventSilentJobManagerData } from './event-silence.type';

@Injectable()
@Processor(QueueNames.EVENT_SILENT)
export class EventSilentJobProcessor {
    private readonly logger = new Logger(EventSilentJobProcessor.name);

    constructor(private readonly silentManager: EventSilentJobManagerService) {
        this.logger.log('Event SilentJobProcessor initialized');
    }

    @Process('*') // ловим все джобы
    async handle<T>(job: Job<EventSilentJobManagerData<T>>) {
        this.logger.log(`Processing job with domain: ${job.data.domain}`);
        this.logger.log(`Processing job with jobName: ${job.data.jobName}`);
        this.logger.log(`Key prefix available: ${!!job.data.keyPrefix}`);
        await this.silentManager.process(job.data);
    }
}
