import { Module } from "@nestjs/common";
import { BitrixCoreModule } from "src/modules/bitrix/core/bitrix-core.module";
import { BxCategoryService } from "./services/bx-category.service";

@Module({
    imports: [
        BitrixCoreModule
    ],
    providers: [
        BxCategoryService
    ],
    exports: [
        BxCategoryService
    ]
})
export class BitrixCategoryDomainModule {}
