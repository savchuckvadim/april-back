import { Module } from "@nestjs/common";
import { BitrixCoreModule } from "../../../core/bitrix-core.module";
import { BxRpaItemService } from "./services/bx-rpa-item.service";
import { BxRpaItemBatchService } from "./services/bx-rpa-item.batch.service";

@Module({
    imports: [
        BitrixCoreModule
    ],
    exports: [
        BxRpaItemService,
        BxRpaItemBatchService
    ],

})
export class BxRpaItemDomainModule { }