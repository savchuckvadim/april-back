import { Module } from '@nestjs/common';
import { RqController } from './rq.controller';
import { RequisiteMapperService } from './services/requisite-mapper.service';
import { RequisiteUpdateService } from './services/requisite-update.service';
import { RqPresetService } from './services/rq-preset.service';
import { GetRqUseCase } from './use-cases/get-rq.use-case';
import { StoreRqUseCase } from './use-cases/store-rq.use-case';
import { UpdateAddressUseCase } from './use-cases/update-address.use-case';
import { RqCaseService } from './services/rq-case.service';
import { PBXModule } from '@/modules/pbx/pbx.module';
import {
    BxRqAddressService,
    BxRqBankService,
    BxRqCustomFieldService,
    BxRqService,
} from './services/BxRqService';

@Module({
    imports: [PBXModule],
    controllers: [RqController],
    providers: [
        RqPresetService,
        RequisiteMapperService,
        RequisiteUpdateService,
        GetRqUseCase,
        StoreRqUseCase,
        UpdateAddressUseCase,
        RqCaseService,

        BxRqService,
        BxRqAddressService,
        BxRqBankService,
        BxRqCustomFieldService,
    ],
    exports: [
        BxRqService,
        RqPresetService,
        RequisiteMapperService,
        RequisiteUpdateService,
    ],
})
export class RqModule {}
