import { Module } from '@nestjs/common';
import { PortalModule } from '@lib/portal-lib/portal/portal.module';
import { PortalBuilderModule } from '@lib/portal-lib/builder';
import { BitrixModule } from '@/modules/bitrix/bitrix.module';
import { BitrixAuthModule } from '@lib/bitrix-auth';
import { MarketplaceCoreModule } from '@lib/marketplace-core';
import { PBXService } from './pbx.service';
// pbx.module.ts

@Module({
    // BitrixAuthModule реализует порт BITRIX_TOKEN_PROVIDER, который
    // инжектится в BitrixServiceFactory (libs/bitrix) для TOKEN-авторизации.
    // MarketplaceCoreModule — OAuth-путь маркетплейс-порталов в PBXService
    // (детект по marketplace_installs + авто-refresh access_token).
    // PortalBuilderModule — локальная сборка IPortal из БД (internalPortal),
    // задел для отказа от внешнего Laravel-портала.
    imports: [
        PortalModule,
        PortalBuilderModule,
        BitrixModule,
        BitrixAuthModule,
        MarketplaceCoreModule,
    ],
    providers: [PBXService],
    exports: [PortalModule, BitrixModule, PBXService],
})
export class PBXModule {}

//   src/
// ├── modules/
// │   ├── pbx/
// │   │   └── pbx.module.ts            # фасад: собирает portal + bitrix
// │
// │   ├── portal/
// │   │   ├── portal.module.ts         # экспортирует PortalService, PortalModelFactory
// │   │   ├── portal.service.ts        # получает портал по domain
// │   │   ├── portal-context.service.ts    # 🔵 Scope.REQUEST, только для HTTP
// │   │   ├── portal-context.middleware.ts # 🔵 кладёт portal в context
// │   │   ├── portal-model.factory.ts  # создаёт PortalModel
// │   │   └── types.ts                 # IPortal, PortalModel, etc.
// │
// │   ├── bitrix/
// │   │   ├── core/
// │   │   │   ├── bitrix-api.service.ts     # 🔵 Scope.REQUEST, инжектит portalContext
// │   │   │   ├── bitrix-api.factory.ts     # 🔴 для очередей (new + init)
// │   │   │   ├── bitrix-context.ts         # 🔴 { portal, bitrixApi } — универсальный объект
// │   │   │   └── bitrix-core.module.ts     # экспортирует API + factory
