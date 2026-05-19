// // core/silence/silent-job-handlers.module.ts
// //
// // Глобальный реестр: handlerId (enum) → async (collected, payload).
// // Модули приложения в onModuleInit регистрируют обработчики; SilentJobProcessor дергает getHandler(handlerId).

// import { Module, Logger } from '@nestjs/common';
// import { SilentJobHandlersRegistry } from '@/core/silence/registry/silent-job-handlers.registry';

// // @Global()
// @Module({
//     providers: [SilentJobHandlersRegistry],
//     exports: [SilentJobHandlersRegistry],
// })
// export class SilentJobHandlersModule {
//     private readonly logger = new Logger(SilentJobHandlersModule.name);

//     constructor(private readonly registry: SilentJobHandlersRegistry) {
//         this.logger.log('SilentJobHandlersModule initialized ✅');
//         this.logger.log(`Registry available: ${!!this.registry}`);
//     }
// }
