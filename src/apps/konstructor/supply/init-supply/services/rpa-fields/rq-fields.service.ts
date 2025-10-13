import { Injectable } from '@nestjs/common';
import { InitSupplyDto } from '../../dto/init-supply.dto';
import { PortalModel } from '@/modules/portal/services/portal.model';
import { IBxRpaItem } from '@/modules/bitrix';
import { BxRqDto } from '@/apps/konstructor/document-generate/dto/bx-rq/bx-rq.dto';
import { ClientTypeEnum } from '@/apps/konstructor/document-generate/type/client.type';
import { InitSupplyBxrqService } from '../bxrq/init-supply-bxrq.service';

@Injectable()
export class InitSupplyRpaRqFieldsService {
    constructor(
        private readonly initSupplyBxrqService: InitSupplyBxrqService,
    ) {}
    public async get(dto: InitSupplyDto, PortalModel: PortalModel) {
        const bxrqValues = this.getBxrqValues(
            dto.bxrq,
            dto.clientType.code,
            PortalModel,
        );

        const rpaFields = {
            ...bxrqValues,
        } as Partial<IBxRpaItem>;

        return rpaFields;
    }

    private getBxrqValues(
        bxrq: BxRqDto,
        clientType: ClientTypeEnum,
        PortalModel: PortalModel,
    ) {
        const { inn, address } = this.initSupplyBxrqService.getBxrqValues(
            bxrq,
            clientType,
        );

        const innRpaFieldBitrixId = PortalModel.getRpaFieldBitrixIdByCode(
            'supply',
            'company_rq_inn',
        );
        const addressRpaFieldBitrixId = PortalModel.getRpaFieldBitrixIdByCode(
            'supply',
            'service_address',
        );

        return {
            [`${innRpaFieldBitrixId}`]: inn,
            [`${addressRpaFieldBitrixId}`]: address,
        };
    }
}
