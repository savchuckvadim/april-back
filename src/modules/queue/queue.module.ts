import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { RedisModule } from 'src/core/redis/redis.module';
import { ConfigService } from '@nestjs/config';
import { QueueDispatcherService } from './dispatch/queue-dispatcher.service';
import { QueueNames } from './constants/queue-names.enum';
// import { SilentJobManagerService } from 'src/core/silence/silent-job-manager.service';
// import { SilentJobProcessor } from './processors/silent-job.processor';
// import { SilentJobHandlersModule } from 'src/core/silence/silent-job-handlers.module';
import { createRedisOptions } from '@/core/redis/redis.config';
import { RedisOptions } from 'ioredis';

@Module({
    imports: [
        BullModule.forRootAsync({
            useFactory: (configService: ConfigService) => {
                const redisOptions = createRedisOptions(configService);

                return {
                    redis: redisOptions.url
                        ? redisOptions.url
                        : ({
                              ...redisOptions,
                          } as RedisOptions),
                };
            },
            inject: [ConfigService],
        }),
        BullModule.registerQueue(
            ...Object.values(QueueNames).map(name => ({ name })),
        ),
        RedisModule,
        // SilentJobHandlersModule,
    ],
    providers: [
        QueueDispatcherService,
        // SilentJobManagerService,
        // SilentJobProcessor,
    ],
    exports: [
        QueueDispatcherService,
        // SilentJobManagerService,
        BullModule,
        // SilentJobHandlersModule,
    ],
})
export class QueueModule {}
