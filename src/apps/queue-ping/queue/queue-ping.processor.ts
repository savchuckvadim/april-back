import { Process, Processor } from "@nestjs/bull";
import { QueueNames } from "src/modules/queue/constants/queue-names.enum";
import { JobNames } from "src/modules/queue/constants/job-names.enum";
import { Job } from "bull";
import { WsService } from "src/core/ws";
import { Logger } from "@nestjs/common";
import { QueuePingUseCase } from "../use-cases/queue-ping.use-case";
import { QueuePingDto } from "../dto/queue.dto";


@Processor(QueueNames.PING)
export class QueuePingQueueProcessor {
    private readonly logger = new Logger(QueueNames.PING);

    constructor(

        private readonly useCase: QueuePingUseCase,
        private readonly ws: WsService, // WebSocket шлюз
        
        /// NO!! scope: REQUEST
    ) {


    }

    @Process(JobNames.PING)
    async handle(job: Job<QueuePingDto>) {
        const dto = job.data
        const socketId = dto.socketId
        this.logger.log('QUEUE PING HANDLE')
        this.logger.log(dto.domain)

        await this.useCase.init(dto.domain)
        this.logger.log(dto.socketId)
        const result = await this.useCase.case(dto);
        this.logger.log('QUEUE PING useCase result')
        this.logger.log(result)
        this.logger.log(socketId)
        
        if (socketId) {

            this.ws.sendToClient(socketId, {
                event: 'queue-ping:done',
                data: result
            });
        }
    }
}