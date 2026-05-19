// import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
// import {
//     SilentJobHandlerId,
//     SilentJobHandlersRegistry,
//     SilentJobManagerService,
// } from '@/core/silence';
// import { ColdHooksSilenceHandlerService } from './cold-hooks-silence-handler.service';
// import { IColdCallData } from '../../type/cold-hook-silence.interface';

// @Injectable()
// export class ColdHookSilenceService implements OnModuleInit {
//     private readonly logger = new Logger(ColdHookSilenceService.name);

//     constructor(
//         private readonly registry: SilentJobHandlersRegistry,
//         private readonly hooksHandler: ColdHooksSilenceHandlerService,
//         private readonly silentManager: SilentJobManagerService,
//     ) {
//         this.logger.log('Cold Hook Silence constructor ✅');
//     }

//     onModuleInit() {
//         this.logger.log('Cold Hook Silence onModuleInit ✅');
//         this.logger.log(`Silence Registry  available: ${!!this.registry}`);
//         this.logger.log(`Cold Hooks Silence available: ${!!this.hooksHandler}`);
//         // this.logger.log(`PortalProviderService available: ${!!this.portalProvider}`);

//         this.logger.log('Registering handler EVENT_SALES_COLD_CALL');
//         this.registry.register(
//             SilentJobHandlerId.EVENT_SALES_COLD_CALL,
//             async (hooks, payload) => {
//                 this.logger.log('HANDLER CALLED event-sales-cold-call');
//                 this.logger.log(`Payload: ${JSON.stringify(payload)}`);
//                 this.logger.log(`Collected: ${JSON.stringify(hooks)}`);

//                 // обработка всех созданных хуков
//                 await this.hooksHandler.handleHooks(payload.domain, hooks);
//             },
//         );
//         this.logger.log('Handler registration completed');
//     }

//     async createColdCallHook(domain: string, coldCallData: IColdCallData) {
//         const domainKey = domain.replace(/\./g, '_'); // чтобы точки не мешались в ключе
//         const keyPrefix = `XO_event_sales_cold_call_${domainKey}_${coldCallData.responsible}`;
//         this.logger.log(
//             `[silent] cold-hook createColdCallHook enter domain=${domain} keyPrefix=${keyPrefix} entityId=${coldCallData.entityId}`,
//         );
//         await this.silentManager.handle(
//             keyPrefix,
//             1500,
//             coldCallData,
//             SilentJobHandlerId.EVENT_SALES_COLD_CALL,
//             { domain },

//         );
//         this.logger.log(
//             `[silent] cold-hook createColdCallHook exit keyPrefix=${keyPrefix}`,
//         );
//     }
// }
