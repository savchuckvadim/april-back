// import { Module, Logger } from '@nestjs/common';
// import { HooksService } from './hooks.service';

// import { QueueModule } from '../queue/queue.module';
// import { RedisModule } from 'src/core/redis/redis.module';
// import { SilenceModule } from 'src/core/silence/silence.module';
// import { AlfaActivityModule } from './alfa/alfa-activity.module';
// import { SilentJobHandlersModule } from 'src/core/silence/silent-job-handlers.module';
// import { HooksController } from './hooks.controller';

// @Module({
//   imports: [
//     SilentJobHandlersModule,
//     QueueModule,
//     RedisModule,
//     SilenceModule,
//     AlfaActivityModule
//   ],

//   controllers: [
//     HooksController

//   ],
//   providers: [
//     HooksService,

//   ],
// })
// export class HooksModule {
//   private readonly logger = new Logger(HooksModule.name);

//   constructor() {
//     this.logger.log('HooksModule initialized');
//   }
// }
