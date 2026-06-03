import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import { PortalModel } from '@/modules/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@/modules/portal/services/types/deals/portal.deal.type';
import { delay } from '@/shared';
import { Injectable } from '@nestjs/common';
import { DealFilterType } from './types/deal-filter.type';
import { getContractPeriodFieldBitrixId } from './utils/get-contract-period-field.util';

@Injectable()
export class DealQueryService {
    constructor(private readonly pbx: PBXService) {}

    public async getOpenDeals(assignedById?: string) {
        const { deals } = await this.getDealsByFilter('open', assignedById);
        return deals;
    }

    public async getOpenDealsByAssigned(assignedById: string) {
        const { deals } = await this.getDealsByFilter('open', assignedById);
        return deals;
    }

    public async getSuccessDealsByAssigned(assignedById: string) {
        const { deals } = await this.getDealsByFilter('success', assignedById);
        return deals;
    }

    public async getAllDealsByAssigned(assignedById: string) {
        const { deals } = await this.getDealsByFilter('all', assignedById);
        return deals;
    }

    public async getFailDeals() {
        const { deals } = await this.getDealsByFilter('fail');
        return deals;
    }

    public async getOpenDealsWithPortal(assignedById?: string) {
        const { deals, portal } = await this.getDealsByFilter(
            'open',
            assignedById,
        );
        return { deals, portal };
    }

    private async getDealsByFilter(
        which: DealFilterType,
        assignedById?: string,
    ): Promise<{ deals: IBXDeal[] | null; portal: PortalModel }> {
        const domain = 'gsr.bitrix24.ru';
        const { PortalModel: portal, bitrix } = await this.pbx.init(domain);
        const deals = await this.getAllDeals(
            bitrix,
            portal,
            which,
            assignedById,
        );
        await delay(1500);
        return { deals, portal };
    }

    private async getAllDeals(
        bitrix: BitrixService,
        portalModel: PortalModel,
        which: DealFilterType = 'all',
        assignedById?: string,
    ): Promise<IBXDeal[] | null> {
        const contractStartField = getContractPeriodFieldBitrixId(
            portalModel,
            'start',
        );
        const contractEndField = getContractPeriodFieldBitrixId(
            portalModel,
            'end',
        );

        const dealService = portalModel.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.service_base,
        );
        if (!dealService) {
            throw new Error('Deal service not found');
        }
        const category = portalModel.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.service_base,
        );

        const stageFailCode = 'service_fail';
        const targetFailStage = portalModel.getStageByCode(stageFailCode);

        const filter: Partial<IBXDeal> = {
            CATEGORY_ID: dealService.bitrixId,
        };
        if (assignedById) {
            filter.ASSIGNED_BY_ID = assignedById;
        }

        if (which === 'open') {
            filter.CLOSED = 'N';
        } else if (which === 'success') {
            filter.STAGE_SEMANTIC_ID = 'S';
        } else if (which === 'fail') {
            filter.STAGE_ID = `C${category?.bitrixId}:${targetFailStage}`;
        }

        return await bitrix.deal.all(filter, [
            'TITLE',
            'COMPANY_TITLE', // такого не бывает надо отдельно запрашивать по company id
            'ID',
            'COMPANY_ID',
            'ASSIGNED_BY_ID',
            'CATEGORY_ID',
            'CLOSED',
            'CLOSED_DATE',
            'CLOSED_BY_ID',
            contractStartField,
            contractEndField,
            'STAGE_ID',
        ]);
    }
}
