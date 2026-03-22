import { Module, forwardRef } from '@nestjs/common';

import { TelegramModule } from '../telegram/telegram.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from 'src/core/redis/redis.module';
import { RedisService } from 'src/core/redis/redis.service';
// import { PortalModule } from '../portal/portal.module';
import { BitrixCoreModule } from './core/bitrix-core.module';

import { BitrixService } from './bitrix.service';
import { BitrixServiceFactory } from './bitrix-service.factory';
import { ServiceClonerFactory } from './domain/service-clone.factory';
import { BitrixApiFactoryService } from './core';
import { BitrixAuthService } from './auth/bitrix-auth.service';
import { BitrixSetupModule } from '../bitrix-setup/bitrix-setup.module';
// C:\Projects\April-KP\april-next\back\src\modules\bitrix\bitrix.module.ts
@Module({
    imports: [
        TelegramModule,
        ConfigModule,
        HttpModule, // 👈 обязательно
        RedisModule,
        // forwardRef(() => PortalModule),
        BitrixCoreModule,
        BitrixSetupModule,
        // BitrixDomainModule,
        // BitrixEndpointsModule,
    ],
    controllers: [],
    providers: [
        RedisService,
        BitrixService,
        BitrixServiceFactory,
        BitrixAuthService,
        ServiceClonerFactory,
        // BitrixApiFactoryService //fromm bitrix core  module
    ],
    exports: [
        BitrixCoreModule,
        // BitrixDomainModule,
        // BitrixEndpointsModule,
        // BitrixService,
        BitrixServiceFactory,
    ],
})
export class BitrixModule {}

// src/modules/bitrix/
// ├── core/
// │   ├── bitrix-api.service.ts
// │   ├── bitrix-api.factory.ts
// │   ├── bitrix-core.module.ts
// │
// ├── domain/
// │   ├── department/
// │   │   ├── department.service.ts
// │   │   ├── department.module.ts
// │   │   └── ...
// │   ├── deal/
// │   │   ├── deal.service.ts
// │   │   ├── deal.module.ts
// │   │   └── ...
// │   └── ...
// │
// ├── endpoints/
// │   ├── department/
// │   │   ├── department.controller.ts
// │   │   ├── department.module.ts  👈 связывает endpoint + domain
// │   │   └── ...
// │   └── ...
// │
// ├── bitrix.module.ts         👈 экспортирует все публичные сервисы
