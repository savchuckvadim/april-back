import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { Injectable } from '@nestjs/common';
import { ActNProductHandlerUseCase } from '../usecases/act-n-product-handler.use-case';

interface SmartActJobData {
    domain: string;
    dealId?: number;
    /** Ставить ли задачи-предупреждения (по умолчанию true). */
    withTasks?: boolean;
}
@Injectable()
@Processor(QueueNames.SERVICE_GENERATE_ACTS)
export class SmartActProcessor {
    constructor(private readonly useCase: ActNProductHandlerUseCase) {}

    @Process(JobNames.SERVICE_GENERATE_ACTS)
    async handle(job: Job<SmartActJobData>) {
        const domain = job.data.domain;
        const withTasks = job.data.withTasks ?? true;
        await this.useCase.execute(domain, Number(job.data.dealId), withTasks);
    }
}
