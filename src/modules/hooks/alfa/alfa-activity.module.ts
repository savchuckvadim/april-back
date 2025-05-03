//modules/hooks/alfa/alfa-activity.module.ts
import { Module, Logger } from '@nestjs/common';

// import { BitrixActivityCreateService } from './services/bitrix-activity-create.service';
import { QueueModule } from '../../queue/queue.module';
import { SilenceModule } from 'src/core/silence/silence.module';
import { AlfaHookController } from './alfa-activity.controller';
import { SilentJobHandlersModule } from 'src/core/silence/silent-job-handlers.module';
import { BitrixModule } from 'src/modules/bitrix/bitrix.module';
import { PortalModule } from 'src/modules/portal/portal.module';
import { TelegramModule } from 'src/modules/telegram/telegram.module';
import { HttpModule } from '@nestjs/axios';
import { AlfaActivityHookService } from './services/alfa-activity-hook.service';

@Module({
  imports: [
    QueueModule,
    SilenceModule,
    SilentJobHandlersModule,
    BitrixModule,
    PortalModule,
    TelegramModule,
    HttpModule,
    // RedisModule
  ],
  controllers: [AlfaHookController],
  providers: [
    AlfaActivityHookService,
    // BitrixActivityCreateService,

  ],
  exports: [AlfaActivityHookService]
})
export class AlfaActivityModule {
  private readonly logger = new Logger(AlfaActivityModule.name);

  constructor() {
    this.logger.log('AlfaActivityModule initialized  ✅  ✅  ✅');
  }
}
// export class AlfaActivityModule {
//   private readonly logger = new Logger(AlfaActivityModule.name);

//   constructor(
//     private readonly registry: SilentJobHandlersRegistry,
//     private readonly bitrixService: BitrixActivityCreateService,

//   ) {
//     this.logger.log('AlfaActivityModule constructor ✅');
//     this.logger.log(`Registry available: ${!!this.registry}`);
//     this.logger.log(`BitrixService available: ${!!this.bitrixService}`);
//     // this.logger.log(`PortalProviderService available: ${!!this.portalContext}`);

//     this.logger.log('Registering handler CREATE_ACTIVITY');
//     this.registry.register(SilentJobHandlerId.CREATE_ACTIVITY, async (collected, payload) => {
//       this.logger.log('HANDLER CALLED create-activity');
//       this.logger.log(`Payload: ${JSON.stringify(payload)}`);
//       this.logger.log(`Collected: ${JSON.stringify(collected)}`);
//       await this.bitrixService.createActivities(
//         payload.domain,
//         collected
//       );
//     });
//     this.logger.log('Handler registration completed');
//   }
// }
