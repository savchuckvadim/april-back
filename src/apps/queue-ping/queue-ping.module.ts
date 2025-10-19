import { Module } from '@nestjs/common';
import { QueuePingController } from './queue-ping.controller';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { QueuePingUseCase } from './use-cases/queue-ping.use-case';
import { QueuePingDispatchService } from './queue/queue-ping.dispatch.service';
import { QueuePingQueueProcessor } from './queue/queue-ping.processor';


@Module({
    imports: [

        PBXModule,
        QueueModule,
    ],
    controllers: [QueuePingController],
    providers: [
        QueuePingQueueProcessor,
        QueuePingUseCase,
        QueuePingDispatchService,
    ],
    exports: [],
})
export class QueuePingModule {}
