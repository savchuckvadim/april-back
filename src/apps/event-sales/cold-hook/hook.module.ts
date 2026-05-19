import { Module } from '@nestjs/common';
import { TelegramModule } from '@/modules/telegram/telegram.module';
import { HttpModule } from '@nestjs/axios';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { EventSalesHookController } from './controllers/hook.controller';
import { QueueModule } from '@/modules/queue/queue.module';
import { ColdHookSilinceEndpointService } from './services/silence/cold-hook-silince-endpoint.service';
import { ColdHooksHandlerService } from './services/silence/cold-hooks-handler.service';
import { EventSilentJobManagerService } from '../event-silence/silent-job-manager.service';
import { EventSilentJobProcessor } from '../event-silence/silent-job.processor';
import { ColdHooksProcessor } from './queue/cold-hooks.processor';
import { RedisModule } from '@/core/redis/redis.module';

@Module({
    imports: [
        // SilenceModule,
        // SilentJobHandlersModule,
        PBXModule,
        TelegramModule,
        HttpModule,
        QueueModule,
        RedisModule,
    ],
    controllers: [EventSalesHookController],
    providers: [
        ColdHookSilinceEndpointService,
        ColdHooksHandlerService,
        EventSilentJobManagerService,
        EventSilentJobProcessor,
        ColdHooksProcessor,
    ],
})
export class EventSalesHookModule {}
// {
//     private readonly logger = new Logger(EventSalesHookModule.name);

//     constructor() {
//         this.logger.log('EventSalesHookModule initialized  ✅  ✅  ✅');
//     }
// }
