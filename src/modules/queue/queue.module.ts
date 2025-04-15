import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { QueueProcessor } from './queue.processor';
import { BitrixModule } from '../bitrix/bitrix.module';
import { RedisModule } from 'src/core/redis/redis.module';
import { RedisService } from 'src/core/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

@Module({
    imports: [
        BullModule.forRootAsync({
            useFactory: (configService: ConfigService) => {
                const host = configService.get('REDIS_HOST') ?? 'redis';
                const port = parseInt(configService.get('REDIS_PORT') ?? '6379', 10);

                const logger = new Logger('BullModule');
                logger.log(`BullModule Redis config: host=${host}, port=${port}`);

                return {
                    redis: {
                        host,
                        port,
                    },
                };
            },
            inject: [ConfigService],
        }),
        BullModule.registerQueue({
            name: 'activity',
        }),
        BitrixModule,
        RedisModule
    ],
    providers: [
        QueueService,
        QueueProcessor,
        RedisService
    ],
    exports: [QueueService],
})
export class QueueModule { } 