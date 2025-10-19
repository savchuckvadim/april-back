// src/modules/bitrix/core/bitrix-core.module.ts
import { Module, forwardRef } from '@nestjs/common';

import { RedisModule } from 'src/core/redis/redis.module';
import { TelegramModule } from 'src/modules/telegram/telegram.module';
import { HttpModule, HttpService } from '@nestjs/axios';
import { BitrixApiFactoryService } from './queue/bitrix-api.factory.service';

@Module({
    imports: [
        // PortalModule,
        RedisModule,
        TelegramModule,
        HttpModule,
        // BitrixSetupAppModule,
    ],
    providers: [
        BitrixApiFactoryService,
    ],
    exports: [
        BitrixApiFactoryService,
    ],
    //     // {
    //     //     provide: BitrixAuthService,
    //     //     useFactory: (http: HttpService, bitrixAppService: BitrixAppService, bitrixTokenService: BitrixTokenService) => {
    //     //         return new BitrixAuthService(http, bitrixAppService, bitrixTokenService);
    //     //     },
    //     //     inject: [HttpService, BitrixAppService
    // providers: [
    //     // BitrixRequestApiService, // для HTTP
    //     BitrixApiFactoryService, // для очередей
    //     // BitrixAuthService, // для auth по токену
    //     // forwardRef(() => BitrixApiFactoryService), BitrixTokenService],
    //     // },


    // ],
    // exports: [
    //     // BitrixRequestApiService,
    //     BitrixApiFactoryService
    // ],
})
export class BitrixCoreModule { }

// В HTTP В любом Controller или Service просто инжектируешь bitrixApi: BitrixApiService — он уже готов.
// В очередях BitrixContext
