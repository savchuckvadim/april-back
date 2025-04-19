import { Module } from '@nestjs/common';
import { BitrixService } from './bitrix.service';
import { TelegramModule } from '../telegram/telegram.module';
import { BitrixApiService } from './api/bitrix-api.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from 'src/core/redis/redis.module';
import { RedisService } from 'src/core/redis/redis.service';
import { BitrixActivityCreateService } from './domain/activity/services/activity-create.service';
import { BitrixContextService } from './services/bitrix-context.service';
import { PortalModule } from '../portal/portal.module';
import { BitrixDepartmentModule } from './endpoints/department/department.module';
import { BitrixCoreModule } from './core/bitrix-core.module';

@Module({
  imports: [
    TelegramModule,
    ConfigModule,
    HttpModule, // 👈 обязательно
    RedisModule,
    PortalModule,
    BitrixCoreModule,
  ],
  controllers: [

  ],
  providers: [
    BitrixService,
    // BitrixApiService,
    BitrixActivityCreateService,
    RedisService,
    // BitrixContextService
  ],
  exports: [
    // BitrixApiService,
    BitrixActivityCreateService,
  ],

})
export class BitrixModule { }
