import { BitrixService, IBXCompany, IBXDeal, IBXLead } from '@/modules/bitrix';
import { IColdCallData } from '../type/cold-hook-silence.interface';
import { PortalModel } from '@/modules/portal/services/portal.model';
import { ColdFlowDealService } from '../services/enities/deal/cold-flow-deal.service';
import { EnumColdCallEntityType } from '../dto/cold.dto';
import { ColdCallBxEntityService } from '../services/enities/entity/cold-call-bx-entity.service';
import { Logger } from '@nestjs/common';

export class ColdCallUseCase {
    private readonly logger = new Logger(ColdCallUseCase.name);
    constructor(
        private readonly bitrixService: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async flow(
        data: IColdCallData,
        company: IBXCompany,
        deal: IBXDeal | null,
        lead: IBXLead | null,
    ) {
        this.logger.log('company', company.ID ?? 'null');
        this.logger.log('deal', deal?.ID ?? 'null');
        this.logger.log('lead', lead?.ID ?? 'null');
        this.logger.log('data', data);
        const service = new ColdFlowDealService(
            this.bitrixService,
            this.portal,
        );
        const enityService = new ColdCallBxEntityService(
            this.bitrixService,
            this.portal,
        );
        enityService.flow({
            name: data.name,
            deadline: data.deadline,
            responsible: data.responsible,
            xoCreated: data.created,
            entity: company,
            entityType: data.entityType,
        });
        await service.flow(data);
    }

    async getInitData(
        entityType: EnumColdCallEntityType,
        entityId: string,
    ): Promise<{
        company: IBXCompany | null;
        lead: IBXLead | null;
        deal: IBXDeal | null;
    }> {
        const result = {
            company: null as IBXCompany | null,
            lead: null as IBXLead | null,
            deal: null as IBXDeal | null,
        };
        if (entityType === EnumColdCallEntityType.COMPANY) {
            const company = await this.bitrixService.company.get(
                Number(entityId),
            );
            result.company = company.result;
        }
        if (entityType === EnumColdCallEntityType.LEAD) {
            const lead = await this.bitrixService.lead.get(Number(entityId));
            result.lead = lead.result;
        }

        if (entityType === EnumColdCallEntityType.DEAL) {
            const deal = await this.bitrixService.deal.get(Number(entityId));
            result.deal = deal.result;
        }

        return result;
    }
}
