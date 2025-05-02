import { Module } from '@nestjs/common';
import { BitrixCoreModule } from '../../core/bitrix-core.module';
import { DepartmentBitrixService } from './services/department-bitrxi.service';

@Module({
    imports: [
        BitrixCoreModule
    ],
    providers: [
        DepartmentBitrixService
    ],
    exports: [
        DepartmentBitrixService
    ]
})
export class BitrixDepartmentDomainModule {}
