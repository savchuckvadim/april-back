import { PBXModule } from '@/modules/pbx';
import { SmartActGsrService } from './services/smart/smart-act-gsr.service';
import { Module } from '@nestjs/common';
import { DealActGsrController } from './controllers/deal-act-gsr.controller';
import { UserInfoService } from './services/user/user-info.service';
import { CompanyInfoService } from './services/company/company-info.service';
import {
    DealContractPeriodService,
    DealGroupingService,
    DealQueryService,
} from './services';
import { OrkDealsService } from './services/ork-deals.service';
import { OrkActsUpdateUseCase } from './usecases/ork-acts-update.use-case';
import { DealPerodDataService } from './services/ork-deals/deal-perod-data.service';
import { CategorySmartActService } from './services/smart/category-smart-act.service';
import { RedisModule } from '@/core/redis/redis.module';
import { OrkActsReconcilePlanUseCase } from './usecases/ork-acts-reconcile-plan.use-case';
import { ActNProductHandlerUseCase } from './usecases/act-n-product-handler.use-case';
import { QueueModule } from '@/modules/queue/queue.module';
import { SmartActProcessor } from './queue/smart-act.processor';

@Module({
    imports: [PBXModule, RedisModule, QueueModule],
    controllers: [DealActGsrController],
    providers: [
        SmartActGsrService,
        OrkDealsService,
        DealQueryService,
        DealGroupingService,
        DealContractPeriodService,
        CompanyInfoService,
        UserInfoService,
        OrkActsUpdateUseCase,
        DealPerodDataService,
        CategorySmartActService,
        OrkActsReconcilePlanUseCase,
        ActNProductHandlerUseCase,
        SmartActProcessor,
    ],
})
export class CommandSmartActGsrModule { }
