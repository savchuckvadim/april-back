import { Module } from '@nestjs/common';
import { BitrixCoreModule } from '../../../core/bitrix-core.module';
import { BxProductRowService } from './services/bx-product-row.service';
import { BxProductRowBatchService } from './services/bx-product-row.batch.service';


@Module({
    imports: [
        BitrixCoreModule
    ],
    providers: [
        BxProductRowService,
        BxProductRowBatchService  
    ],
    exports: [
        BxProductRowService,
        BxProductRowBatchService  
    ]
})
export class BitrixProductRowDomainModule {}
