import { Module } from '@nestjs/common';
import { EventSilentJobManagerService } from './silent-job-manager.service';
import { EventSilentJobProcessor } from './silent-job.processor';
import { QueueModule } from '@/modules/queue/queue.module';
import { RedisModule } from '@/core/redis/redis.module';

@Module({
    imports: [QueueModule, RedisModule],
    providers: [EventSilentJobManagerService, EventSilentJobProcessor],
    exports: [EventSilentJobManagerService],
})
export class EventSilenceModule {}
