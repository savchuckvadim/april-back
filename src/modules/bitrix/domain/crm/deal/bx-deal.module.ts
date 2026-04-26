import { Module } from '@nestjs/common';
// import { BitrixCoreModule } from '../../../core/bitrix-core.module';
import { BxDealService } from './services/bx-deal.service';
import { BxDealBatchService } from './services/bx-deal.batch.service';

@Module({
    exports: [BxDealService, BxDealBatchService],
})
export class BitrixDealDomainModule {}
