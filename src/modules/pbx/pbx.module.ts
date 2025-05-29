import { Module } from "@nestjs/common";
import { PortalModule } from "../portal/portal.module";
import { BitrixModule } from "../bitrix/bitrix.module";
import { PBXService } from "./pbx.servise";
// pbx.module.ts
@Module({
    imports: [
      PortalModule,
      BitrixModule,
    ],
    providers: [
      PBXService
    ],
    exports: [
      PortalModule,
      BitrixModule,
      PBXService
    ],
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

  