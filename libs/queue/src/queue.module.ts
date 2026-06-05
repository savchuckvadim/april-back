import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { RedisModule } from '@lib/core/redis/redis.module';
import { ConfigService } from '@nestjs/config';
import { QueueDispatcherService } from './dispatch/queue-dispatcher.service';
import { QueueNames } from './constants/queue-names.enum';
import { createRedisOptions } from '@lib/core/redis/redis.config';
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
    ],
    providers: [QueueDispatcherService],
    exports: [QueueDispatcherService, BullModule],
})
export class QueueModule {}
