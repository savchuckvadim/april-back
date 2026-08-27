import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { JobNames, QueueNames } from '@lib/queue';
import { OrkSupplyTaskService } from '../services/ork-supply-task.service';
import { OrkSupplyTaskJobDto } from '../dto/ork-supply-task.dto';

@Processor(QueueNames.SERVICE_ORK_TASKS)
export class OrkSupplyTaskProcessor {
    private readonly logger = new Logger(OrkSupplyTaskProcessor.name);

    constructor(private readonly orkSupplyTaskService: OrkSupplyTaskService) {}

    @Process(JobNames.SERVICE_ORK_SUPPLY_TASKS)
    async handle(job: Job<OrkSupplyTaskJobDto>): Promise<number[]> {
        this.logger.log(
            `${JobNames.SERVICE_ORK_SUPPLY_TASKS}: ${job.data.domain} rpa ${job.data.rpaTypeId}:${job.data.rpaId}`,
        );
        return await this.orkSupplyTaskService.createSupplyTasks(job.data);
    }
}
