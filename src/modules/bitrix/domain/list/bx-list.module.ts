import { Module } from '@nestjs/common';
import { BitrixCoreModule } from '../../core/bitrix-core.module';
import { BxListService } from './services/bx-list.service';
import { BxListBatchService } from './services/bx-list.batch.service';

@Module({
    imports: [
        BitrixCoreModule
    ],
    providers: [
        BxListService,
        BxListBatchService
    ],
    exports: [
        BxListService,
        BxListBatchService
    ]
})
export class BitrixListDomainModule { } 