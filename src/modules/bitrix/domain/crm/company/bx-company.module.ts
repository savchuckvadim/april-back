import { Module } from '@nestjs/common';
import { BitrixCoreModule } from '../../../core/bitrix-core.module';
import { BxCompanyBatchService } from './services/bx-company.batch.service';
import { BxCompanyService } from './services/bx-company.service';


@Module({
    imports: [
        BitrixCoreModule
    ],
    providers: [
        BxCompanyService,
        BxCompanyBatchService  
    ],
    exports: [
        BxCompanyService,
        BxCompanyBatchService  
    ]
})
export class BitrixCompanyDomainModule {}
