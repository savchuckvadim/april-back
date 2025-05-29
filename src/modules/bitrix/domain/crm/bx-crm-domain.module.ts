import { Module } from "@nestjs/common";
import { BxFieldService } from "./fields/bx-field.service";
import { BitrixDealDomainModule } from "./deal/bx-deal.module";
import { BitrixCompanyDomainModule } from "./company/bx-company.module";
import { BitrixProductRowDomainModule } from "./product-row/bx-product-row.module";
import { BitrixContactDomainModule } from "./contact/bx-contact.module";
import { BitrixCategoryDomainModule } from "./category/bx-category.module";
import { BitrixStatusDomainModule } from "./status/bx-status.module";
import { BitrixItemDomainModule } from "./item/bx-item.module";
import { BxTimelineModule } from "./timeline/bx-timeline.module";
@Module({
    imports: [
        BitrixDealDomainModule,
        BitrixCompanyDomainModule,
        BitrixProductRowDomainModule,
        BitrixContactDomainModule,
        BitrixCategoryDomainModule,
        BitrixStatusDomainModule,
        BitrixItemDomainModule,
        BxTimelineModule
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
        BitrixItemDomainModule,
        BxTimelineModule,
        BxFieldService
    ]
})
export class BxCrmDomainModule { }