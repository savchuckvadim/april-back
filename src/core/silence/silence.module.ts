import { Module, Logger } from "@nestjs/common";
import { RedisModule } from "../redis/redis.module";
import { SilentJobManagerService } from "./silent-job-manager.service";
import { QueueDispatcherService } from "src/modules/queue/dispatch/queue-dispatcher.service";
import { QueueModule } from "src/modules/queue/queue.module";

@Module({
    imports: [RedisModule, QueueModule],
    providers: [SilentJobManagerService, QueueDispatcherService],
    exports: [SilentJobManagerService],
})
export class SilenceModule {
    private readonly logger = new Logger(SilenceModule.name);

    constructor() {
        this.logger.log('SilenceModule initialized');
    }
}