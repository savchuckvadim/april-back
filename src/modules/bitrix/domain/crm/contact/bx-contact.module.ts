import { Module } from "@nestjs/common";
import { BitrixCoreModule } from "src/modules/bitrix/core/bitrix-core.module";
import { BxContactService } from "./services/bx-contact.service";
import { BxContactBatchService } from "./services/bx-contact.batch.service";

@Module({
    imports: [
        BitrixCoreModule
    ],
    providers: [
        BxContactService,
        BxContactBatchService  
    ],
    exports: [
        BxContactService,
        BxContactBatchService  
    ]
})
export class BitrixContactDomainModule {}