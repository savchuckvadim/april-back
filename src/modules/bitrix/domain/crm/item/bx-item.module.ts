import { Module } from '@nestjs/common';
import { BitrixCoreModule } from '../../../core/bitrix-core.module';
import {  BxItemBatchService } from './services/bx-item.batch.service';
import { BxItemService } from './services/bx-item.service';


@Module({
    imports: [
        BitrixCoreModule
    ],
    providers: [
        BxItemService,
        BxItemBatchService
    ],
    exports: [
        BxItemService,
        BxItemBatchService  
    ]
})
export class BitrixItemDomainModule {}
