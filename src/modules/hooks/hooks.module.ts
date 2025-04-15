import { Module } from '@nestjs/common';
import { HooksService } from './hooks.service';
import { HooksController } from './hooks.controller';
import { QueueModule } from '../queue/queue.module';
import { RedisModule } from 'src/core/redis/redis.module';
import { RedisService } from 'src/core/redis/redis.service';

@Module({
  imports: [QueueModule, RedisModule], // 👈 обязательно подключи тут

  controllers: [HooksController],
  providers: [HooksService, RedisService],
})
export class HooksModule {}
