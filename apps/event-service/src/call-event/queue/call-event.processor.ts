import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { CallingEventDto } from '../dto/calling-event.dto';
import { CallEventUseCase } from '../use-cases/call-event.use-case';

/**
 * Воркер очереди события звонка. Берёт `CallingEventDto` из job.data и
 * прогоняет через {@link CallEventUseCase}.
 */
@Injectable()
@Processor(QueueNames.SERVICE_CALL_EVENT)
export class CallEventProcessor {
    private readonly logger = new Logger(CallEventProcessor.name);

    constructor(private readonly useCase: CallEventUseCase) {}

    @Process(JobNames.SERVICE_CALL_EVENT)
    async handle(job: Job<CallingEventDto>): Promise<void> {
        const dto = job.data;
        this.logger.log(
            `Обработка call-event: domain=${dto.domain}, company=${dto.bx?.companyId}`,
        );
        await this.useCase.execute(dto);
    }
}
