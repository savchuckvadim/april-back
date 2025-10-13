import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { InitDealUseCase } from '../init-deal.use-case';
import { InitDealDto } from '../dto/init-deal.dto';

@Processor(QueueNames.SERVICE_DEALS)
export class InitDealProcessor {
    private readonly logger = new Logger(InitDealProcessor.name);

    constructor(private readonly useCase: InitDealUseCase) {
        this.logger.log('SERVICE_DEAL_MOVE_STAGES');
    }

    @Process(JobNames.SERVICE_DEAL_INIT)
    async handle(job: Job<InitDealDto>) {
        this.logger.log('SERVICE_DEAL_INIT processor');
        console.log(job.data);
        await this.useCase.execute(job.data);
    }
}
