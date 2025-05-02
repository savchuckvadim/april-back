// import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
// import { SilentJobHandlerId } from "src/core/silence/constants/silent-job-handlers.enum";
// import { SilentJobHandlersRegistry } from "src/core/silence/silent-job-handlers.registry";
// import { BitrixActivityCreateService } from "src/modules/bitrix/domain/activity/services/activity-create.service";
// import { PortalProviderService } from "src/modules/portal/services/portal-provider.service";
// import { AlfaActivityModule } from "../alfa-activity.module";

// @Injectable()
// export class AlfaActivityRegistryService implements OnModuleInit {
//   private readonly logger = new Logger(AlfaActivityModule.name);

//   constructor(

//     private readonly registry: SilentJobHandlersRegistry,
//     private readonly bitrixService: BitrixActivityCreateService,
//     private readonly portalProvider: PortalProviderService
//   ) {
//     this.logger.log('AlfaActivityModule constructor ✅');
//   }

//   onModuleInit() {
//     this.logger.log('AlfaActivityModule onModuleInit ✅');
//     this.logger.log(`Registry available: ${!!this.registry}`);
//     this.logger.log(`BitrixService available: ${!!this.bitrixService}`);
//     this.logger.log(`PortalProviderService available: ${!!this.portalProvider}`);

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
