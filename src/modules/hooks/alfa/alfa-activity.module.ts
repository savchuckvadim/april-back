//modules/hooks/alfa/alfa-activity.module.ts
import { Module, Logger } from '@nestjs/common';

// import { BitrixActivityCreateService } from './services/bitrix-activity-create.service';
import { QueueModule } from '../../queue/queue.module';
import { SilenceModule } from 'src/core/silence/silence.module';
import { SilentJobHandlersRegistry } from 'src/core/silence/silent-job-handlers.registry';
// import { AlfaActivityData, AlfaPayload } from './types/alfa-activity-data.interface';
import { AlfaHookController } from './alfa-activity.controller';
import { SilentJobHandlersModule } from 'src/core/silence/silent-job-handlers.module';
import { BitrixModule } from 'src/modules/bitrix/bitrix.module';
import { RedisService } from 'src/core/redis/redis.service';
import { QueueDispatcherService } from 'src/modules/queue/dispatch/queue-dispatcher.service';
import { SilentJobHandlerId } from 'src/core/silence/constants/silent-job-handlers.enum';
import { BitrixActivityCreateService } from 'src/modules/bitrix/domain/activity/services/activity-create.service';
// import { BitrixContextService } from 'src/modules/bitrix/services/bitrix-context.service';
import { PortalModule } from 'src/modules/portal/portal.module';
import { PortalProviderService } from 'src/modules/portal/services/portal-provider.service';
// import { PortalContextService } from 'src/modules/portal/services/portal-context.service';

@Module({
  imports: [
    QueueModule,
    SilenceModule,
    SilentJobHandlersModule,
    BitrixModule,
    PortalModule
  ],
  controllers: [AlfaHookController],
  providers: [
    BitrixActivityCreateService,
    // RedisService,
    QueueDispatcherService,
    // BitrixContextService,
    // PortalContextService
  ],
  exports: [BitrixActivityCreateService]
})
export class AlfaActivityModule {
  private readonly logger = new Logger(AlfaActivityModule.name);

  constructor(
    private readonly registry: SilentJobHandlersRegistry,
    private readonly bitrixService: BitrixActivityCreateService,
    private readonly portalContext: PortalProviderService
  ) {
    this.logger.log('AlfaActivityModule constructor ✅');
    this.logger.log(`Registry available: ${!!this.registry}`);
    this.logger.log(`BitrixService available: ${!!this.bitrixService}`);
    this.logger.log(`PortalProviderService available: ${!!this.portalContext}`);

    this.logger.log('Registering handler CREATE_ACTIVITY');
    this.registry.register(SilentJobHandlerId.CREATE_ACTIVITY, async (collected, payload) => {
      this.logger.log('HANDLER CALLED create-activity');
      this.logger.log(`Payload: ${JSON.stringify(payload)}`);
      this.logger.log(`Collected: ${JSON.stringify(collected)}`);
      await this.bitrixService.createActivities(
        payload.domain,
        collected
      );
    });
    this.logger.log('Handler registration completed');
  }
}
