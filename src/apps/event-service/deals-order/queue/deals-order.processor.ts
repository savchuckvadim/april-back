import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { SendDealsWarningsUseCase } from '../usecases/send-deals-warnings.use-case';

@Injectable()
@Processor(QueueNames.SERVICE_DEALS_ORDER)
export class DealsOrderProcessor {
    private readonly logger = new Logger(DealsOrderProcessor.name);

    constructor(
        private readonly sendDealsWarningsUseCase: SendDealsWarningsUseCase,
    ) {
        this.logger.log('SERVICE_DEAL_MOVE_STAGES');
    }

    @Process(JobNames.SERVICE_DEALS_ORDER)
    async handle() {
        await this.sendDealsWarningsUseCase.execute();
    }
}
