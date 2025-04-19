import { Module, Logger } from '@nestjs/common';
import { HooksService } from './hooks.service';
import { HooksController } from './hooks.controller';
import { QueueModule } from '../queue/queue.module';
import { RedisModule } from 'src/core/redis/redis.module';
import { RedisService } from 'src/core/redis/redis.service';
import { SilentJobManagerService } from 'src/core/silence/silent-job-manager.service';
import { SilenceModule } from 'src/core/silence/silence.module';
import { AlfaActivityModule } from './alfa/alfa-activity.module';
import { SilentJobHandlersModule } from 'src/core/silence/silent-job-handlers.module';

@Module({
  imports: [
    SilentJobHandlersModule,
    QueueModule,
    RedisModule,
    SilenceModule,
    AlfaActivityModule
  ],

  controllers: [
    HooksController

  ],
  providers: [
    HooksService,
    RedisService,
    SilentJobManagerService
  ],
})
export class HooksModule {
  private readonly logger = new Logger(HooksModule.name);

  constructor() {
    this.logger.log('HooksModule initialized');
  }
}
