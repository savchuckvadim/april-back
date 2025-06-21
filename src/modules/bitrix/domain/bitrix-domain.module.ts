import { Module } from '@nestjs/common';
import { BitrixActivityDomainModule } from './activity/activity.module';
import { BitrixDepartmentDomainModule } from './department/department.module';
import { BxCrmDomainModule } from './crm/bx-crm-domain.module';
import { BxCatalogDomainModule } from './catalog/bx-catalog.module';
import { UserFieldConfigModule } from './userfieldconfig';
@Module({ 
    imports: [
        BitrixActivityDomainModule,
        BitrixDepartmentDomainModule,
        BxCrmDomainModule,
        BxCatalogDomainModule,
        UserFieldConfigModule
    ],
    exports: [
        BitrixActivityDomainModule,
        BitrixDepartmentDomainModule,
        BxCrmDomainModule,
        BxCatalogDomainModule,
        UserFieldConfigModule
    ]
})
export class BitrixDomainModule { }
