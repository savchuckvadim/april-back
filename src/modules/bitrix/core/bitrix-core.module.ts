// src/modules/bitrix/core/bitrix-core.module.ts
import { Module } from '@nestjs/common';
import { BitrixApiService } from './http/bitrix-api.service';
// import { BitrixContextService } from '../services/bitrix-context.service';
import { PortalModule } from 'src/modules/portal/portal.module';
import { RedisModule } from 'src/core/redis/redis.module';
import { TelegramModule } from 'src/modules/telegram/telegram.module';
import { HttpModule } from '@nestjs/axios';
import { BitrixApiFactoryService } from './queue/bitrix-api.factory.service';
// C:\Projects\April-KP\april-next\back\src\modules\bitrix\core\bitrix-core.module.ts

@Module({
  imports: [PortalModule, RedisModule, TelegramModule, HttpModule],
  providers: [
    
    BitrixApiService,     // для HTTP
    BitrixApiFactoryService,   // для очередей
    

  ],
  exports: [
    BitrixApiService,
    BitrixApiFactoryService

  ],
})
export class BitrixCoreModule { }

// В HTTP В любом Controller или Service просто инжектируешь bitrixApi: BitrixApiService — он уже готов.
// В очередях BitrixContext 