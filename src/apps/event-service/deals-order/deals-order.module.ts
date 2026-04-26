import { PBXModule } from '@/modules/pbx';
import { Module } from '@nestjs/common';
import { DealServiceService } from './services/ork-deals/deal-service.service';
import {
    DealContractPeriodService,
    DealGroupingService,
    DealQueryService,
    DealMessageService,
    DealWarningsBbcodeFormatterService,
    CompanyInfoService,
    UserInfoService,
    DealsOrderQueueService,
} from './services';
import { SendDealsWarningsUseCase } from './usecases/send-deals-warnings.use-case';
import { DealsOrderProcessor } from './queue/deals-order.processor';
import { QueueModule } from '@/modules/queue/queue.module';

@Module({
    imports: [PBXModule, QueueModule],
    providers: [
        DealServiceService,
        DealQueryService,
        DealGroupingService,
        DealContractPeriodService,
        DealMessageService,
        DealWarningsBbcodeFormatterService,
        CompanyInfoService,
        UserInfoService,
        SendDealsWarningsUseCase,
        DealsOrderQueueService,
        DealsOrderProcessor,
    ],
    exports: [DealsOrderQueueService],
})
export class DealsOrderModule {}
