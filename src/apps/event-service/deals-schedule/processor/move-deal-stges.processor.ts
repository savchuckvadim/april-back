import { JobNames } from "@/modules/queue/constants/job-names.enum";
import { QueueNames } from "@/modules/queue/constants/queue-names.enum";
import { InjectQueue, Process, Processor } from "@nestjs/bull";
import { MoveDealStagesService } from "../services/move-deal-stages";
import { Logger } from "@nestjs/common";
import { Job } from "bull";

@Processor(QueueNames.SERVICE_DEALS_SCHEDULE)
export class EventServiceMoveDealStagesProcessor {
    private readonly logger = new Logger(EventServiceMoveDealStagesProcessor.name);

    constructor(
        // @InjectQueue(QueueNames.SERVICE_DEALS_SCHEDULE)
       
        private readonly moveDealStagesService: MoveDealStagesService

    ) {

        this.logger.log('SERVICE_DEAL_MOVE_STAGES')
    }

    @Process(JobNames.SERVICE_DEAL_MOVE_STAGES)
    async handle(job: Job) {
        this.logger.log('SERVICE_DEAL_MOVE_STAGES')
        console.log(' handle')
        await this.moveDealStagesService.moveDealStages()
    }
}
