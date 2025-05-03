import { Module } from '@nestjs/common';
import { QueuePingController } from './queue-ping.controller';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { QueuePingUseCase } from './use-cases/queue-ping.use-case';
import { QueuePingDispatchService } from './queue/queue-ping.dispatch.service';
import { QueuePingQueueProcessor } from './queue/queue-ping.processor';
import { PortalModule } from 'src/modules/portal/portal.module';
import { BitrixModule } from 'src/modules/bitrix/bitrix.module';
import { PortalService } from 'src/modules/portal/portal.service';

@Module({
  imports: [

    PortalModule,
    BitrixModule,
    // PBXModule,
    QueueModule,

  ],
  controllers: [QueuePingController],
  providers: [

    QueuePingQueueProcessor,
    QueuePingUseCase,
    QueuePingDispatchService,

  ],
  exports: [
   
  ]
})
export class QueuePingModule { }
