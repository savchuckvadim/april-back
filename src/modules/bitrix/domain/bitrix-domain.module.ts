import { Module } from '@nestjs/common';
import { BitrixActivityDomainModule } from './activity/activity.module';
import { BitrixDepartmentDomainModule } from './department/department.module';
import { BxCrmDomainModule } from './crm/bx-crm-domain.module';
@Module({ 
    imports: [
        BitrixActivityDomainModule,
        BitrixDepartmentDomainModule,
        BxCrmDomainModule
    ],
    exports: [
        BitrixActivityDomainModule,
        BitrixDepartmentDomainModule,
        BxCrmDomainModule
    ]
})
export class BitrixDomainModule { }
