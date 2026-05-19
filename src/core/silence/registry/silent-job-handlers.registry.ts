// //core/silence/silent-job-handlers.registry.ts
// import { Injectable, Logger } from '@nestjs/common';
// import { HandlerFn, HandlerMap } from '../type/silence.type';
// // import { AlfaPayload } from 'src/modules/hooks/alfa/types/alfa-activity-data.interface';
// // import { AlfaActivityData } from 'src/modules/hooks/alfa/types/alfa-activity-data.interface';
// // import { IColdHookSilenceHandlerData } from '@/apps/event-sales/cold-hook';

// @Injectable()
// export class SilentJobHandlersRegistry {
//     private readonly logger = new Logger(SilentJobHandlersRegistry.name);
//     private readonly handlers = new Map<keyof HandlerMap, HandlerFn<any>>();

//     constructor() {
//         this.logger.log('SilentJobHandlersRegistry initialized');
//     }

//     register<K extends keyof HandlerMap>(id: K, handler: HandlerFn<K>) {
//         this.logger.log(`Registering handler for ${id}`);
//         this.handlers.set(id, handler);
//         this.logger.log(
//             `Current handlers: ${Array.from(this.handlers.keys()).join(', ')}`,
//         );
//     }

//     getHandler<K extends keyof HandlerMap>(id: K): HandlerFn<K> | undefined {
//         this.logger.log(`Getting handler for ${id}`);
//         this.logger.log(
//             `Available handlers: ${Array.from(this.handlers.keys()).join(', ')}`,
//         );
//         return this.handlers.get(id);
//     }
// }
