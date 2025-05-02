import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { JobNames } from "src/modules/queue/constants/job-names.enum";
import { QueueNames } from "src/modules/queue/constants/queue-names.enum";
import { QueuePingDto } from "../dto/queue.dto";

export class QueuePingDispatchService {

    constructor(
        @InjectQueue(QueueNames.PING) private readonly queue: Queue,

    ) { }
    async dispatch(dto: QueuePingDto) {
        const jobGotResult = await this.queue
            .add(JobNames.PING, dto)

        return { status: 'queued', result: jobGotResult };
    }
}