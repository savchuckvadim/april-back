import { Module } from '@nestjs/common';
import { RqController } from './rq.controller';
import { RequisiteService } from './services/requisite.service';
import { RequisiteMapperService } from './services/requisite-mapper.service';
import { RequisiteUpdateService } from './services/requisite-update.service';
import { GetRqUseCase } from './use-cases/get-rq.use-case';
import { StoreRqUseCase } from './use-cases/store-rq.use-case';
import { UpdateAddressUseCase } from './use-cases/update-address.use-case';
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
        RequisiteService,
        RequisiteMapperService,
        RequisiteUpdateService,
        GetRqUseCase,
        StoreRqUseCase,
        UpdateAddressUseCase,

        BxRqService,
        BxRqAddressService,
        BxRqBankService,
        BxRqCustomFieldService,
    ],
    exports: [RequisiteService, RequisiteMapperService, RequisiteUpdateService],
})
export class RqModule {}
