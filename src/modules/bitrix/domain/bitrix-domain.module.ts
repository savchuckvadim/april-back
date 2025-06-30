import { Module } from '@nestjs/common';
import { BitrixActivityDomainModule } from './activity/activity.module';
import { BitrixDepartmentDomainModule } from './department/department.module';
import { BxCrmDomainModule } from './crm/bx-crm-domain.module';
import { BxCatalogDomainModule } from './catalog/bx-catalog.module';
import { UserFieldConfigModule } from './userfieldconfig';
import { BxRpaItemDomainModule } from './rpa/item/bx-rpa-item-domain.module';
import { BxFileDomainModule } from './file/bx-file.module';
@Module({ 
    imports: [
        BitrixActivityDomainModule,
        BitrixDepartmentDomainModule,
        BxCrmDomainModule,
        BxCatalogDomainModule,
        UserFieldConfigModule,
        BxRpaItemDomainModule,
        BxFileDomainModule
    ],
    exports: [
        BitrixActivityDomainModule,
        BitrixDepartmentDomainModule,
        BxCrmDomainModule,
        BxCatalogDomainModule,
        UserFieldConfigModule,
        BxRpaItemDomainModule,
        BxFileDomainModule
    ]
})
export class BitrixDomainModule { }
