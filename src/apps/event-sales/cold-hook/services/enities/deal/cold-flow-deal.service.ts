import { BitrixService } from '@/modules/bitrix';
import { IColdCallData } from '../../../type/cold-hook-silence.interface';
import {
    BitrixDealService,
    BitrixEntityFlowService,
} from '@/apps/event-sales/shared';
import { PortalModel } from '@/modules/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@/modules/portal/services/types/deals/portal.deal.type';
import { Logger } from '@nestjs/common';

export class ColdFlowDealService {
    private readonly logger = new Logger(ColdFlowDealService.name);
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async flow(data: IColdCallData) {
        const { entityType, entityId } = data;
        const dealService = new BitrixDealService(this.bitrix);
        const entityService = new BitrixEntityFlowService(this.bitrix);
        // console.log('dealService', dealService);
        // console.log('entityService', entityService);
        // console.log('portal', this.portal);
        // console.log('data', data);
        const currentEntity = await this.bitrix[entityType].get(
            Number(entityId),
        );
        const currentEntityData = currentEntity.result;
        // this.logger.log('currentEntityData', currentEntityData);

        const pDealCategory = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        // this.logger.log('pDealCategory', pDealCategory);
    }
}
