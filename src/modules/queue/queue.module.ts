import { BullModule } from '@nestjs/bull';
import { Module, Logger, forwardRef } from '@nestjs/common';
// import { QueueService } from './queue.service';
// import { QueueProcessor } from './queue.processor';
// import { BitrixModule } from '../bitrix/bitrix.module';
import { RedisModule } from 'src/core/redis/redis.module';
// import { RedisService } from 'src/core/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { QueueDispatcherService } from './dispatch/queue-dispatcher.service';
import { QueueNames } from './constants/queue-names.enum';
import { SilentJobManagerService } from 'src/core/silence/silent-job-manager.service';
import { SilentJobProcessor } from './processors/silent-job.processor';
import { SilentJobHandlersModule } from 'src/core/silence/silent-job-handlers.module';
import { createRedisOptions } from '@/core/redis/redis.config';
import { RedisOptions } from 'ioredis';
// import { SalesKpiReportQueueProcessor } from 'src/apps/kpi-report/queue/kpi-report.processor';
// import { KpiReportModule } from 'src/apps/kpi-report/kpi-report.module';

@Module({
    imports: [
        BullModule.forRootAsync({
            useFactory: (configService: ConfigService) => {
                const redisOptions = createRedisOptions(configService);
                
                return {
                    redis: redisOptions.url
                        ? redisOptions.url
                        : {
                            ...redisOptions
                        } as RedisOptions,
                };
            },
            inject: [ConfigService],
        }),
        BullModule.registerQueue(
            ...Object.values(QueueNames).map(name => ({ name })),
        ),
        // BitrixModule,
        RedisModule,
        SilentJobHandlersModule,
        // forwardRef(() => KpiReportModule),
    ],
    providers: [
        // QueueService,
        // QueueProcessor,
        // RedisService,
        QueueDispatcherService,
        SilentJobManagerService,
        SilentJobProcessor,
        // SalesKpiReportQueueProcessor
    ],
    exports: [
        // QueueService,
        QueueDispatcherService,
        BullModule,
        SilentJobHandlersModule,
    ],
})

export class QueueModule { }
