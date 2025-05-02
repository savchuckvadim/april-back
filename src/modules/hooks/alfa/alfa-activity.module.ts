//modules/hooks/alfa/alfa-activity.module.ts
import { Module, Logger } from '@nestjs/common';

// import { BitrixActivityCreateService } from './services/bitrix-activity-create.service';
import { QueueModule } from '../../queue/queue.module';
import { SilenceModule } from 'src/core/silence/silence.module';
import { SilentJobHandlersRegistry } from 'src/core/silence/silent-job-handlers.registry';
// import { AlfaActivityData, AlfaPayload } from './types/alfa-activity-data.interface';
import { AlfaHookController } from './alfa-activity.controller';
import { SilentJobHandlersModule } from 'src/core/silence/silent-job-handlers.module';

import { QueueDispatcherService } from 'src/modules/queue/dispatch/queue-dispatcher.service';
import { SilentJobHandlerId } from 'src/core/silence/constants/silent-job-handlers.enum';
import { BitrixActivityCreateService } from 'src/modules/bitrix/domain/activity/services/activity-create.service';

import { RedisModule } from 'src/core/redis/redis.module';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { PortalProviderService } from 'src/modules/portal/services/portal-provider.service';
import { AlfaActivityRegistryService } from './services/alfa-activity-init-module.service';
import { PortalModule } from 'src/modules/portal/portal.module';
import { BitrixActivityDomainModule } from 'src/modules/bitrix/domain/activity/activity.module';
import { BitrixCoreModule } from 'src/modules/bitrix/core/bitrix-core.module';

@Module({
  imports: [
    QueueModule,
    SilenceModule,
    SilentJobHandlersModule,
    // PBXModule,
    RedisModule,
    PortalModule,
    BitrixCoreModule,
    BitrixActivityDomainModule
  ],
  controllers: [AlfaHookController],
  providers: [
    BitrixActivityCreateService,
    QueueDispatcherService,
    PortalProviderService,
    AlfaActivityRegistryService
  ],
  exports: [AlfaActivityRegistryService]
})
export class AlfaActivityModule { }
