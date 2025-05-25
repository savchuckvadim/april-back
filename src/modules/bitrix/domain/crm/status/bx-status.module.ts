import { Module } from "@nestjs/common";
import { BitrixCoreModule } from "src/modules/bitrix/core/bitrix-core.module";
import { BxStatusService } from "./services/bx-status.service";

@Module({
    imports: [
        BitrixCoreModule
    ],
    providers: [
        BxStatusService
    ],
    exports: [
        BxStatusService
    ]
})
export class BitrixStatusDomainModule {}
