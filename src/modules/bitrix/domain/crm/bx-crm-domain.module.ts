import { Module } from "@nestjs/common";
import { BxFieldService } from "./fields/bx-field.service";
import { BitrixDealDomainModule } from "./deal/bx-deal.module";
import { BitrixCompanyDomainModule } from "./company/bx-company.module";
import { BitrixProductRowDomainModule } from "./product-row/bx-product-row.module";
import { BitrixContactDomainModule } from "./contact/bx-contact.module";
import { BitrixCategoryDomainModule } from "./category/bx-category.module";
import { BitrixStatusDomainModule } from "./status/bx-status.module";

@Module({
    imports: [
        BitrixDealDomainModule,
        BitrixCompanyDomainModule,
        BitrixProductRowDomainModule,
        BitrixContactDomainModule,
        BitrixCategoryDomainModule,
        BitrixStatusDomainModule
    ],
    providers: [

        BxFieldService
    ],
    exports: [
        BitrixDealDomainModule,
        BitrixCompanyDomainModule,
        BitrixProductRowDomainModule,
        BitrixContactDomainModule,
        BitrixCategoryDomainModule,
        BitrixStatusDomainModule,
        BxFieldService
    ]
})
export class BxCrmDomainModule { }