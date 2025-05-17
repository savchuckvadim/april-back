import { Module } from "@nestjs/common";
import { PBXModule } from "src/modules/pbx/pbx.module";
import { ListService } from "./list.service";
import { ListController } from "./bx-list-endpoint.controller";
import { RedisModule } from "src/core/redis/redis.module";
import { PortalModule } from "src/modules/portal/portal.module";
import { BitrixCoreModule } from "../../core/bitrix-core.module";

@Module({
    imports: [
        PortalModule,
        RedisModule,
        BitrixCoreModule
    ],
    controllers: [
        ListController
    ],
    providers: [
        ListService
    ],
    exports: [ListService]
})

export class BxListEndpointModule { }
