// src/modules/bitrix/core/bitrix-core.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { BitrixRequestApiService } from './http/bitrix-request-api.service';
// import { BitrixContextService } from '../services/bitrix-context.service';
import { PortalModule } from 'src/modules/portal/portal.module';
import { RedisModule } from 'src/core/redis/redis.module';
import { TelegramModule } from 'src/modules/telegram/telegram.module';
import { HttpModule } from '@nestjs/axios';
import { BitrixApiFactoryService } from './queue/bitrix-api.factory.service';


@Module({
  imports: [
    PortalModule, 
    RedisModule, 
    TelegramModule, 
    HttpModule
  ],
  providers: [

    BitrixRequestApiService,     // для HTTP
    BitrixApiFactoryService,   // для очередей



  ],
  exports: [
    BitrixRequestApiService,
    BitrixApiFactoryService,



  ],
})
export class BitrixCoreModule { }

// В HTTP В любом Controller или Service просто инжектируешь bitrixApi: BitrixApiService — он уже готов.
// В очередях BitrixContext 