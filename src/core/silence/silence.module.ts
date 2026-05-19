// import { Module, Logger } from '@nestjs/common';
// import { RedisModule } from '../redis/redis.module';
// import { SilentJobManagerService } from './services/silent-job-manager.service';
// import { QueueModule } from 'src/modules/queue/queue.module';
// import { SilentJobProcessor } from './processors/silent-job.processor';
// import { SilentJobHandlersModule } from './silent-job-handlers.module';

// /**
//  * Модуль «тишины»: Redis-буфер + Bull-очередь `silent`.
//  *
//  * - QueueModule даёт Bull + QueueDispatcherService (один экземпляр на приложение).
//  * - SilentJobManagerService — только HTTP-путь: merge в Redis + постановка джоба.
//  * - SilentJobProcessor — воркер: тишина → collect → handler → снятие dedup-ключа _job.
//  * - SilentJobHandlersModule — реестр handlerId → async (collected, payload).
//  */
// @Module({
//     imports: [RedisModule, QueueModule, SilentJobHandlersModule],
//     providers: [SilentJobManagerService, SilentJobProcessor],
//     exports: [SilentJobManagerService],
// })
// export class SilenceModule {
//     private readonly logger = new Logger(SilenceModule.name);

//     constructor() {
//         this.logger.log('SilenceModule initialized');
//     }
// }
