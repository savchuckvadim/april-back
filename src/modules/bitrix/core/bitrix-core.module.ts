// src/modules/bitrix/core/bitrix-core.module.ts
import { Module, Global } from '@nestjs/common';
import { BitrixApiService } from '../api/bitrix-api.service';
import { BitrixContextService } from '../services/bitrix-context.service';
import { PortalModule } from 'src/modules/portal/portal.module';
import { RedisModule } from 'src/core/redis/redis.module';
import { TelegramModule } from 'src/modules/telegram/telegram.module';
import { HttpModule } from '@nestjs/axios';

@Global()
@Module({
  imports: [PortalModule, RedisModule, TelegramModule, HttpModule],
  providers: [BitrixApiService, BitrixContextService],
  exports: [BitrixApiService, BitrixContextService],
})
export class BitrixCoreModule {}
