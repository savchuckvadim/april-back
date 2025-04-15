import { Module } from '@nestjs/common';
import { BitrixService } from './bitrix.service';
import { BitrixController } from './bitrix.controller';
import { BitrixActivityCreateService } from './infrastructure/services/activity/activity-create.service';
import { TelegramModule } from '../telegram/telegram.module';
import { BitrixApiService } from './bitrix-api.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from 'src/core/redis/redis.module';
import { RedisService } from 'src/core/redis/redis.service';

@Module({
  imports: [
    TelegramModule,
    ConfigModule,
    HttpModule, // 👈 обязательно
    RedisModule
  ],
  controllers: [BitrixController],
  providers: [BitrixService, BitrixApiService, BitrixActivityCreateService, RedisService],
  exports: [BitrixActivityCreateService], // чтобы использовать в процессоре очереди

})
export class BitrixModule { }
