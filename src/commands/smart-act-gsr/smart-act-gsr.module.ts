import { PBXModule } from '@/modules/pbx';
import { SmartActGsrController } from './controllers/smart-act-gsr.controller';
import { SmartActGsrService } from './services/smart-act-gsr.service';
import { Module } from '@nestjs/common';
import { DealServiceService } from './services/deal-service.service';
import { DealActGsrController } from './controllers/deal-act-gsr.controller';
import {
    DealContractPeriodService,
    DealGroupingService,
    DealQueryService,
} from './services';
import { DealMessageService } from './services/deal-message.service';
import { DealWarningsBbcodeFormatterService } from './services/deal-warnings-bbcode-formatter.service';
import { CompanyInfoService } from './services/company-info.service';
import { UserInfoService } from './services/user-info.service';
import { SendDealsWarningsUseCase } from './usecases/send-deals-warnings.use-case';

@Module({
    imports: [PBXModule],
    controllers: [SmartActGsrController, DealActGsrController],
    providers: [
        SmartActGsrService,
        DealServiceService,
        DealQueryService,
        DealGroupingService,
        DealContractPeriodService,
        DealMessageService,
        DealWarningsBbcodeFormatterService,
        CompanyInfoService,
        UserInfoService,
        SendDealsWarningsUseCase,
    ],
})
export class CommandSmartActGsrModule {}
