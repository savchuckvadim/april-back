import { Module } from '@nestjs/common';
import { BitrixActivityDomainModule } from './activity/activity.module';
import { BitrixDepartmentDomainModule } from './department/department.module';

@Module({ 
    imports: [
        BitrixActivityDomainModule,
        BitrixDepartmentDomainModule,
    ],
    exports: [
        BitrixActivityDomainModule,
        BitrixDepartmentDomainModule,
    ]
})
export class BitrixDomainModule { }
