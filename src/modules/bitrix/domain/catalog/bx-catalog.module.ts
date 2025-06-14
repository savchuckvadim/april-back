import { Module } from "@nestjs/common";
import { BitrixCoreModule } from "../../core/bitrix-core.module";
import { BxProductService } from "./services/bx-product.service";
import { BxProductBatchService } from "./services/bx-product.batch.service";


@Module({
    imports: [
        BitrixCoreModule,
    ],
    providers: [
        BxProductService,
        BxProductBatchService
    ],
    exports: [
        BxProductService,
        BxProductBatchService
    ]
  
})

export class BxCatalogDomainModule {}