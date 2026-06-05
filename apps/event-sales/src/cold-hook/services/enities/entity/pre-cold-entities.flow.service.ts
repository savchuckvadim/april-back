import { BitrixService, IBXCompany, IBXDeal } from '@/modules/bitrix';
import { IColdHookSilenceHandlerData } from '../../../type/cold-hook-silence.interface';
import { EnumColdCallEntityType } from '../../../dto/cold.dto';
import { prepareBatchResults } from '@/apps/event-sales/shared';

export interface PreColdEntitesResult {
    companies: IBXCompany[];
    companiesIds: number[];
}
export class PreColdEntitiesFlowService {
    // private readonly logger = new Logger(PreColdEntitiesFlowService.name);

    constructor(private readonly bitrix: BitrixService) {}

    public async getPreColdEntities(
        hooks: IColdHookSilenceHandlerData['collected'],
    ): Promise<PreColdEntitesResult> {
        const companiesIds: number[] = [];
        const dealsIds: number[] = [];
        let companies: IBXCompany[] = [];
        let baseDeals: IBXDeal[] = [];
        for (const key in hooks) {
            const hook = hooks[key];
            if (hook.entityType === EnumColdCallEntityType.COMPANY) {
                companiesIds.push(Number(hook.entityId));
            } else if (hook.entityType === EnumColdCallEntityType.DEAL) {
                dealsIds.push(Number(hook.entityId));
            }
        }
        if (dealsIds && dealsIds.length) {
            baseDeals = await this.getEntitiesByEntitiesIds<IBXDeal>(
                EnumColdCallEntityType.DEAL,
                dealsIds,
            );
            baseDeals.map(deal => {
                companiesIds.push(Number(deal.COMPANY_ID));
            });
        }
        companies = await this.getEntitiesByEntitiesIds<IBXCompany>(
            EnumColdCallEntityType.COMPANY,
            companiesIds,
        );

        return { companies, companiesIds };
    }

    private async getEntitiesByEntitiesIds<T extends IBXCompany | IBXDeal>(
        entityType: EnumColdCallEntityType,
        ids: number[],
    ): Promise<T[]> {
        ids.map(id => {
            const key = `pre_xo_${this.bitrix.api.domain}_${entityType}_${id}`;
            this.bitrix.batch[entityType].get(key, id);
        });
        const result = await this.bitrix.api.callBatchWithConcurrency(1);
        const entities = prepareBatchResults<T>(result);
        return entities;
    }
}
